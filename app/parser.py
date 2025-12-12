import json
import os
import logging
from datetime import datetime
from typing import Dict, Optional, Tuple, List
from urllib.parse import urlparse
import aiofiles
from .models import Product, Settings
from .gpt_client import GPTClient

# Налаштування логування
logger = logging.getLogger(__name__)


DB_FILE = "app/db.json"
SETTINGS_FILE = "app/settings.json"
COMPETITORS_FILE = "app/competitors.json"
PROGRESS_FILE = "app/db/progress.json"
CHARACTERISTICS_FILE = "app/characteristics.json"


async def load_db() -> Dict:
    """Завантажує базу даних товарів (асинхронно)"""
    try:
        async with aiofiles.open(DB_FILE, "r", encoding="utf-8") as f:
            content = await f.read()
            return json.loads(content)
    except FileNotFoundError:
        return {"products": []}
    except Exception as e:
        # Якщо помилка, повертаємо порожній список
        return {"products": []}


async def save_db(data: Dict):
    """Зберігає базу даних товарів (асинхронно)"""
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    async with aiofiles.open(DB_FILE, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, ensure_ascii=False, indent=2))


async def load_settings() -> Settings:
    """Завантажує налаштування (асинхронно)"""
    try:
        async with aiofiles.open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            content = await f.read()
            data = json.loads(content)
            # Додаємо token_usage_history для старих ключів, якщо його немає
            if "keys" in data:
                for key_data in data["keys"]:
                    if "token_usage_history" not in key_data:
                        key_data["token_usage_history"] = []
            return Settings(**data)
    except FileNotFoundError:
        return Settings()
    except Exception:
        return Settings()


async def save_settings(settings: Settings):
    """Зберігає налаштування (асинхронно)"""
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    # Конвертуємо в dict з підтримкою моделей Pydantic
    settings_dict = settings.dict()
    # Переконуємося, що token_usage_history є списком
    if "keys" in settings_dict:
        for key_data in settings_dict["keys"]:
            if "token_usage_history" not in key_data:
                key_data["token_usage_history"] = []
            # Конвертуємо TokenUsage об'єкти в dict
            if key_data["token_usage_history"]:
                key_data["token_usage_history"] = [
                    item if isinstance(item, dict) else item.dict()
                    for item in key_data["token_usage_history"]
                ]
    async with aiofiles.open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        await f.write(json.dumps(settings_dict, ensure_ascii=False, indent=2))


async def get_active_api_key() -> Optional[str]:
    """Отримує активний API ключ (асинхронно)"""
    settings = await load_settings()
    if settings.current_key:
        for key_obj in settings.keys:
            if key_obj.id == settings.current_key and key_obj.active:
                return key_obj.key
    return None


def is_first_parse(product: Product) -> bool:
    """Перевіряє, чи це перший парсинг товару"""
    return product.name_parsed is None or product.sku is None


async def find_competitor_by_url(product_url: str) -> Optional[Tuple[str, str]]:
    """
    Знаходить конкурента за URL товару.
    Повертає (competitor_id, competitor_name) або None, якщо не знайдено.
    """
    try:
        # Парсимо URL товару
        product_parsed = urlparse(product_url)
        product_domain = product_parsed.netloc.lower()
        
        # Завантажуємо конкурентів
        competitors_db = await load_competitors()
        
        # Шукаємо конкурента, чий URL відповідає домену товару
        for competitor in competitors_db.get("competitors", []):
            if not competitor.get("active", True):
                continue
                
            competitor_url = competitor.get("url", "")
            if not competitor_url:
                continue
                
            # Парсимо URL конкурента
            competitor_parsed = urlparse(competitor_url)
            competitor_domain = competitor_parsed.netloc.lower()
            
            # Порівнюємо домени (з урахуванням www та без)
            product_domain_clean = product_domain.replace("www.", "")
            competitor_domain_clean = competitor_domain.replace("www.", "")
            
            if product_domain_clean == competitor_domain_clean:
                competitor_id = competitor.get("id")
                competitor_name = competitor.get("name")
                if competitor_id and competitor_name:
                    logger.info(f"Знайдено конкурента за URL: {competitor_name} (ID: {competitor_id}) для товару {product_url}")
                    return (competitor_id, competitor_name)
        
        logger.warning(f"Не знайдено конкурента за URL товару: {product_url}")
        return None
    except Exception as e:
        logger.error(f"Помилка пошуку конкурента за URL: {e}")
        return None


async def parse_product(product: Product) -> Dict:
    """Парсить товар через GPT (асинхронно)"""
    from .gpt_client import ProductNotFoundError
    
    settings = await load_settings()
    api_key_obj = None
    if settings.current_key:
        for key_obj in settings.keys:
            if key_obj.id == settings.current_key and key_obj.active:
                api_key_obj = key_obj
                break
    
    if not api_key_obj:
        raise Exception("Немає активного API ключа. Додайте та активуйте ключ у налаштуваннях.")
    
    client = GPTClient(api_key_obj.key)
    
    try:
        if is_first_parse(product):
            # Перший парсинг - збираємо всю інформацію
            parsed_data = client.parse_first_time(product.url)
            # Зберігаємо токени
            if "_token_usage" in parsed_data:
                await save_token_usage(api_key_obj.id, parsed_data["_token_usage"])
                del parsed_data["_token_usage"]  # Видаляємо з результату
            
            # Визначаємо конкурента за URL товару
            competitor_info = await find_competitor_by_url(product.url)
            if competitor_info:
                competitor_id, competitor_name = competitor_info
                # Підставляємо назву конкурента з бази даних замість назви з HTML
                parsed_data["competitor_name"] = competitor_name
                parsed_data["competitor_id"] = competitor_id
                logger.info(f"Підставлено назву конкурента з бази даних: {competitor_name} (ID: {competitor_id})")
            else:
                # Якщо не знайдено конкурента за URL, залишаємо назву з GPT
                logger.warning(f"Не знайдено конкурента за URL, використовуємо назву з GPT: {parsed_data.get('competitor_name')}")
            
            return {
                "name": parsed_data.get("name"),
                "sku": parsed_data.get("sku"),
                "price": parsed_data.get("price"),
                "availability": parsed_data.get("availability"),
                "competitor_name": parsed_data.get("competitor_name"),
                "competitor_id": parsed_data.get("competitor_id"),
                "category_path": parsed_data.get("category_path", [])
            }
        else:
            # Оновлення - тільки ціна та наявність
            parsed_data = client.parse_update(product.url)
            # Зберігаємо токени
            if "_token_usage" in parsed_data:
                await save_token_usage(api_key_obj.id, parsed_data["_token_usage"])
                del parsed_data["_token_usage"]  # Видаляємо з результату
            return {
                "price": parsed_data.get("price"),
                "availability": parsed_data.get("availability")
            }
    except ProductNotFoundError as e:
        # Товар не знайдено на сайті (404) - встановлюємо статус "disabled_by_competitor"
        logger.warning(f"Товар {product.id} вимкнений конкурентом: {str(e)}")
        return {
            "status": "disabled_by_competitor"
        }


async def parse_product_full(product: Product) -> Dict:
    """Парсить товар через GPT з повними даними (завжди виконує повний парсинг)"""
    from .gpt_client import ProductNotFoundError
    
    settings = await load_settings()
    api_key_obj = None
    if settings.current_key:
        for key_obj in settings.keys:
            if key_obj.id == settings.current_key and key_obj.active:
                api_key_obj = key_obj
                break
    
    if not api_key_obj:
        raise Exception("Немає активного API ключа. Додайте та активуйте ключ у налаштуваннях.")
    
    client = GPTClient(api_key_obj.key)
    
    try:
        # Завжди виконуємо повний парсинг
        parsed_data = client.parse_first_time(product.url)
        # Зберігаємо токени
        if "_token_usage" in parsed_data:
            await save_token_usage(api_key_obj.id, parsed_data["_token_usage"])
            del parsed_data["_token_usage"]  # Видаляємо з результату
        
        # Визначаємо конкурента за URL товару
        competitor_info = await find_competitor_by_url(product.url)
        if competitor_info:
            competitor_id, competitor_name = competitor_info
            # Підставляємо назву конкурента з бази даних замість назви з HTML
            parsed_data["competitor_name"] = competitor_name
            parsed_data["competitor_id"] = competitor_id
            logger.info(f"Підставлено назву конкурента з бази даних: {competitor_name} (ID: {competitor_id})")
        else:
            # Якщо не знайдено конкурента за URL, залишаємо назву з GPT
            logger.warning(f"Не знайдено конкурента за URL, використовуємо назву з GPT: {parsed_data.get('competitor_name')}")
        
        return {
            "name": parsed_data.get("name"),
            "sku": parsed_data.get("sku"),
            "price": parsed_data.get("price"),
            "availability": parsed_data.get("availability"),
            "competitor_name": parsed_data.get("competitor_name"),
            "competitor_id": parsed_data.get("competitor_id"),
            "category_path": parsed_data.get("category_path", [])
        }
    except ProductNotFoundError as e:
        # Товар не знайдено на сайті (404) - встановлюємо статус "disabled_by_competitor"
        logger.warning(f"Товар {product.id} вимкнений конкурентом: {str(e)}")
        return {
            "status": "disabled_by_competitor"
        }


async def save_result(product_id: str, parsed_data: Dict):
    """Зберігає результат парсингу (асинхронно)"""
    db = await load_db()
    
    for product in db["products"]:
        if product["id"] == product_id:
            now = datetime.now().isoformat()
            
            # Перевіряємо, чи це статус "disabled_by_competitor"
            if "status" in parsed_data and parsed_data["status"] == "disabled_by_competitor":
                logger.info(f"Встановлюємо статус 'disabled_by_competitor' для товару {product_id}")
                product["status"] = "disabled_by_competitor"
                product["last_parsed_at"] = now
                # Додаємо лог про вимкнення
                if "logs" not in product:
                    product["logs"] = []
                log_entry = {
                    "date": now,
                    "operation": "parse",
                    "status": "error",
                    "message": "Товар вимкнений конкурентом (404 - товар не знайдено на сайті)"
                }
                product["logs"].append(log_entry)
                await save_db(db)
                logger.info(f"Статус 'disabled_by_competitor' збережено для товару {product_id}")
                return
            
            if "name" in parsed_data and parsed_data["name"] is not None:
                product["name_parsed"] = parsed_data["name"]
            if "sku" in parsed_data and parsed_data["sku"] is not None:
                product["sku"] = parsed_data["sku"]
            if "price" in parsed_data:
                product["price"] = parsed_data["price"]
            if "availability" in parsed_data and parsed_data["availability"] is not None:
                product["availability"] = parsed_data["availability"]
            if "competitor_name" in parsed_data:
                # Зберігаємо competitor_name навіть якщо він null (щоб очистити старе значення)
                # Але якщо він не порожній рядок, зберігаємо його
                if parsed_data["competitor_name"] is not None and parsed_data["competitor_name"] != "":
                    product["competitor_name"] = parsed_data["competitor_name"]
            if "category_path" in parsed_data:
                # Зберігаємо category_path навіть якщо він порожній масив
                product["category_path"] = parsed_data["category_path"] if parsed_data["category_path"] is not None else []
            if "competitor_id" in parsed_data:
                # Зберігаємо competitor_id якщо він є
                if parsed_data["competitor_id"] is not None and parsed_data["competitor_id"] != "":
                    product["competitor_id"] = parsed_data["competitor_id"]
            
            product["last_parsed_at"] = now
            product["status"] = "parsed"
            
            # Оновлюємо історію
            await update_history(product_id, parsed_data.get("price"), parsed_data.get("availability"), db)
            
            break
    
    await save_db(db)


async def update_history(product_id: str, price: Optional[float], availability: Optional[str], db: Optional[Dict] = None):
    """Оновлює історію змін товару (асинхронно)"""
    if db is None:
        db = await load_db()
        should_save = True
    else:
        should_save = False  # Якщо db переданий, збереження відбувається в батьківській функції
    
    for product in db["products"]:
        if product["id"] == product_id:
            history_entry = {
                "date": datetime.now().isoformat(),
                "price": price,
                "availability": availability
            }
            
            if "history" not in product:
                product["history"] = []
            
            product["history"].append(history_entry)
            break
    
    # Зберігаємо тільки якщо db не був переданий (викликано окремо)
    if should_save:
        await save_db(db)


async def save_token_usage(key_id: str, token_usage: Dict):
    """Зберігає інформацію про використання токенів для API ключа (асинхронно)"""
    from .models import TokenUsage
    
    settings = await load_settings()
    
    for key_obj in settings.keys:
        if key_obj.id == key_id:
            # Створюємо запис про використання токенів
            usage_entry = TokenUsage(
                timestamp=datetime.now().isoformat(),
                prompt_tokens=token_usage.get("prompt_tokens", 0),
                completion_tokens=token_usage.get("completion_tokens", 0),
                total_tokens=token_usage.get("total_tokens", 0)
            )
            
            # Додаємо до історії
            if not hasattr(key_obj, "token_usage_history") or key_obj.token_usage_history is None:
                key_obj.token_usage_history = []
            
            key_obj.token_usage_history.append(usage_entry)
            break
    
    await save_settings(settings)


async def load_competitors() -> Dict:
    """Завантажує базу даних конкурентів (асинхронно)"""
    try:
        async with aiofiles.open(COMPETITORS_FILE, "r", encoding="utf-8") as f:
            content = await f.read()
            return json.loads(content)
    except FileNotFoundError:
        return {"competitors": []}
    except Exception as e:
        return {"competitors": []}


async def save_competitors(data: Dict):
    """Зберігає базу даних конкурентів (асинхронно)"""
    os.makedirs(os.path.dirname(COMPETITORS_FILE), exist_ok=True)
    async with aiofiles.open(COMPETITORS_FILE, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, ensure_ascii=False, indent=2))


async def get_token_statistics(key_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict:
    """Отримує статистику використання токенів за період (асинхронно)"""
    settings = await load_settings()
    
    for key_obj in settings.keys:
        if key_obj.id == key_id:
            history = getattr(key_obj, "token_usage_history", []) or []
            
            # Фільтруємо за періодом
            if start_date or end_date:
                filtered_history = []
                for entry in history:
                    entry_date = entry.get("timestamp", "") if isinstance(entry, dict) else entry.timestamp
                    if start_date and entry_date < start_date:
                        continue
                    if end_date and entry_date > end_date:
                        continue
                    filtered_history.append(entry)
                history = filtered_history
            
            # Підраховуємо статистику
            total_prompt = sum(entry.get("prompt_tokens", 0) if isinstance(entry, dict) else entry.prompt_tokens for entry in history)
            total_completion = sum(entry.get("completion_tokens", 0) if isinstance(entry, dict) else entry.completion_tokens for entry in history)
            total_tokens = sum(entry.get("total_tokens", 0) if isinstance(entry, dict) else entry.total_tokens for entry in history)
            
            return {
                "key_id": key_id,
                "key_name": key_obj.name,
                "period_start": start_date,
                "period_end": end_date,
                "total_requests": len(history),
                "total_prompt_tokens": total_prompt,
                "total_completion_tokens": total_completion,
                "total_tokens": total_tokens,
                "history": history
            }
    
    return {
        "key_id": key_id,
        "total_requests": 0,
        "total_prompt_tokens": 0,
        "total_completion_tokens": 0,
        "total_tokens": 0,
        "history": []
    }


# ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ПРОГРЕСОМ ЗАДАЧ ==========

async def load_progress() -> Dict:
    """Завантажує прогрес задач (асинхронно)"""
    try:
        os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
        async with aiofiles.open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            content = await f.read()
            return json.loads(content)
    except FileNotFoundError:
        return {"tasks": {}}
    except Exception as e:
        return {"tasks": {}}


async def save_progress(data: Dict):
    """Зберігає прогрес задач (асинхронно)"""
    os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
    async with aiofiles.open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, ensure_ascii=False, indent=2))


async def update_task_progress(task_id: str, done: int = None, total: int = None, status: str = None, error: str = None):
    """Оновлює прогрес задачі"""
    progress = await load_progress()
    
    if task_id not in progress["tasks"]:
        progress["tasks"][task_id] = {
            "type": "unknown",
            "total": 0,
            "done": 0,
            "errors": [],
            "status": "running"
        }
    
    # Якщо статус змінюється на "running", очищаємо помилки
    if status == "running" and progress["tasks"][task_id].get("status") != "running":
        progress["tasks"][task_id]["errors"] = []
    
    if done is not None:
        progress["tasks"][task_id]["done"] = done
    if total is not None:
        progress["tasks"][task_id]["total"] = total
    if status is not None:
        progress["tasks"][task_id]["status"] = status
    if error is not None:
        if "errors" not in progress["tasks"][task_id]:
            progress["tasks"][task_id]["errors"] = []
        progress["tasks"][task_id]["errors"].append(error)
    
    await save_progress(progress)


async def get_task_status(task_id: str) -> Optional[Dict]:
    """Отримує статус задачі"""
    progress = await load_progress()
    return progress["tasks"].get(task_id)


# ========== АСИНХРОННІ ФУНКЦІЇ ФОНОВОГО ПАРСИНГУ ==========

async def parse_all_products(task_id: str):
    """Асинхронна функція для парсингу всіх товарів у фоновому режимі (тільки ціна та наявність для вже спарсених)"""
    try:
        db = await load_db()
        total = len(db["products"])
        
        if total == 0:
            await update_task_progress(task_id, done=0, total=0, status="finished")
            return
        
        await update_task_progress(task_id, done=0, total=total, status="running")
        
        success_count = 0
        error_count = 0
        
        for idx, product_data in enumerate(db["products"]):
            try:
                product = Product(**product_data)
                # parse_product автоматично визначає, чи це перший парсинг чи оновлення
                # Для вже спарсених товарів парсить тільки ціну та наявність
                parsed_data = await parse_product(product)
                await save_result(product.id, parsed_data)
                # Перевіряємо, чи товар не вимкнений конкурентом (це не помилка)
                if parsed_data.get("status") == "disabled_by_competitor":
                    success_count += 1  # Вважаємо успішним, бо це очікуваний результат
                else:
                    success_count += 1
                await update_task_progress(task_id, done=idx + 1, total=total)
            except Exception as e:
                error_count += 1
                error_msg = f"Товар {product_data.get('name', product_data.get('id', 'unknown'))}: {str(e)}"
                await update_task_progress(task_id, done=idx + 1, total=total, error=error_msg)
        
        # Перевіряємо, чи є помилки
        progress = await load_progress()
        task = progress["tasks"].get(task_id, {})
        errors = task.get("errors", [])
        
        if error_count > 0 and success_count == 0:
            # Якщо всі товари з помилками
            await update_task_progress(task_id, status="failed")
        elif error_count > 0:
            # Якщо є помилки, але є і успішні
            await update_task_progress(task_id, status="finished")
        else:
            # Всі успішні
            await update_task_progress(task_id, status="finished")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        await update_task_progress(task_id, status="failed", error=f"Критична помилка: {str(e)}\n{error_details}")


async def parse_single_product(task_id: str, product_id: str):
    """Асинхронна функція для парсингу одного товару у фоновому режимі"""
    try:
        await update_task_progress(task_id, done=0, total=1, status="running", error=None)
        
        db = await load_db()
        product_data = None
        for p in db["products"]:
            if p["id"] == product_id:
                product_data = p
                break
        
        if not product_data:
            raise Exception("Товар не знайдено")
        
        product = Product(**product_data)
        parsed_data = await parse_product(product)
        await save_result(product_id, parsed_data)
        
        # Перевіряємо, чи товар не вимкнений конкурентом
        if parsed_data.get("status") == "disabled_by_competitor":
            await update_task_progress(task_id, done=1, total=1, status="finished")
        else:
            await update_task_progress(task_id, done=1, total=1, status="finished")
    except Exception as e:
        await update_task_progress(task_id, done=1, total=1, status="failed", error=str(e))


async def parse_single_product_full(task_id: str, product_id: str):
    """Асинхронна функція для повного парсингу одного товару у фоновому режимі"""
    try:
        await update_task_progress(task_id, done=0, total=1, status="running", error=None)
        
        db = await load_db()
        product_data = None
        for p in db["products"]:
            if p["id"] == product_id:
                product_data = p
                break
        
        if not product_data:
            raise Exception("Товар не знайдено")
        
        product = Product(**product_data)
        parsed_data = await parse_product_full(product)
        await save_result(product_id, parsed_data)
        
        await update_task_progress(task_id, done=1, total=1, status="finished")
    except Exception as e:
        await update_task_progress(task_id, done=1, total=1, status="failed", error=str(e))


async def parse_filtered_products(task_id: str, filters: Dict):
    """Асинхронна функція для парсингу відфільтрованих товарів у фоновому режимі"""
    try:
        db = await load_db()
        products = db["products"]
        
        # Застосовуємо ті ж фільтри, що і в endpoint
        filtered = products
        
        if filters.get("name"):
            name_lower = filters["name"].lower()
            filtered = [p for p in filtered if name_lower in (p.get("name", "") or "").lower() or 
                      name_lower in (p.get("name_parsed", "") or "").lower()]
        
        if filters.get("competitor_id"):
            filtered = [p for p in filtered if p.get("competitor_id") == filters["competitor_id"]]
        
        # Фільтр по категоріях (category_ids)
        if filters.get("category_ids") and len(filters["category_ids"]) > 0:
            # Шукаємо товари, у яких category_path містить хоча б одну з вибраних категорій
            competitors_db = await load_competitors()
            
            # Збираємо всі назви категорій за ID
            category_names = []
            def find_category_by_id(categories, cat_id):
                for cat in categories:
                    if cat.get("id") == cat_id:
                        return cat.get("name")
                    if cat.get("children"):
                        found = find_category_by_id(cat["children"], cat_id)
                        if found:
                            return found
                return None
            
            for competitor in competitors_db.get("competitors", []):
                for cat_id in filters["category_ids"]:
                    cat_name = find_category_by_id(competitor.get("categories", []), cat_id)
                    if cat_name:
                        category_names.append(cat_name)
            
            if category_names:
                filtered = [p for p in filtered if any(
                    cat_name in (p.get("category_path", []) or []) for cat_name in category_names
                )]
        
        if filters.get("status"):
            filtered = [p for p in filtered if p.get("status") == filters["status"]]
        
        if filters.get("availability"):
            filtered = [p for p in filtered if (p.get("availability") or "").lower() == filters["availability"].lower()]
        
        if filters.get("price_from") is not None:
            filtered = [p for p in filtered if p.get("price") is not None and p.get("price", 0) >= filters["price_from"]]
        
        if filters.get("price_to") is not None:
            filtered = [p for p in filtered if p.get("price") is not None and p.get("price", 0) <= filters["price_to"]]
        
        if filters.get("problematic"):
            filtered = [p for p in filtered if (
                p.get("status") == "error" or
                (p.get("status") == "parsed" and (p.get("price") is None or p.get("availability") is None))
            )]
        
        total = len(filtered)
        
        if total == 0:
            await update_task_progress(task_id, done=0, total=0, status="finished")
            return
        
        await update_task_progress(task_id, done=0, total=total, status="running")
        
        success_count = 0
        error_count = 0
        
        for idx, product_data in enumerate(filtered):
            try:
                product = Product(**product_data)
                parsed_data = await parse_product(product)
                await save_result(product.id, parsed_data)
                # Перевіряємо, чи товар не вимкнений конкурентом (це не помилка)
                if parsed_data.get("status") == "disabled_by_competitor":
                    success_count += 1  # Вважаємо успішним, бо це очікуваний результат
                else:
                    success_count += 1
                await update_task_progress(task_id, done=idx + 1, total=total)
            except Exception as e:
                error_count += 1
                error_msg = f"Товар {product_data.get('name', product_data.get('id', 'unknown'))}: {str(e)}"
                await update_task_progress(task_id, done=idx + 1, total=total, error=error_msg)
        
        # Перевіряємо, чи є помилки
        progress = await load_progress()
        task = progress["tasks"].get(task_id, {})
        errors = task.get("errors", [])
        
        if error_count > 0 and success_count == 0:
            await update_task_progress(task_id, status="failed")
        elif error_count > 0:
            await update_task_progress(task_id, status="finished")
        else:
            await update_task_progress(task_id, status="finished")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        await update_task_progress(task_id, status="failed", error=f"Критична помилка: {str(e)}\n{error_details}")


async def parse_selected_products(task_id: str, product_ids: list):
    """Асинхронна функція для парсингу вибраних товарів у фоновому режимі"""
    try:
        db = await load_db()
        total = len(product_ids)
        
        if total == 0:
            await update_task_progress(task_id, done=0, total=0, status="finished")
            return
        
        await update_task_progress(task_id, done=0, total=total, status="running")
        
        success_count = 0
        error_count = 0
        
        for idx, product_id in enumerate(product_ids):
            try:
                product_data = None
                for p in db["products"]:
                    if p["id"] == product_id:
                        product_data = p
                        break
                
                if not product_data:
                    error_count += 1
                    error_msg = f"Товар з ID {product_id} не знайдено"
                    await update_task_progress(task_id, done=idx + 1, total=total, error=error_msg)
                    continue
                
                product = Product(**product_data)
                parsed_data = await parse_product(product)
                logger.info(f"Товар {product_id}: parsed_data = {parsed_data}")
                await save_result(product_id, parsed_data)
                # Перевіряємо, чи товар не вимкнений конкурентом (це не помилка)
                if parsed_data.get("status") == "disabled_by_competitor":
                    logger.info(f"Товар {product_id} вимкнений конкурентом - вважаємо успішним")
                    success_count += 1  # Вважаємо успішним, бо це очікуваний результат
                else:
                    success_count += 1
                await update_task_progress(task_id, done=idx + 1, total=total)
            except Exception as e:
                error_count += 1
                error_msg = f"Товар {product_id}: {str(e)}"
                await update_task_progress(task_id, done=idx + 1, total=total, error=error_msg)
        
        # Перевіряємо, чи є помилки
        progress = await load_progress()
        task = progress["tasks"].get(task_id, {})
        errors = task.get("errors", [])
        
        if error_count > 0 and success_count == 0:
            await update_task_progress(task_id, status="failed")
        elif error_count > 0:
            await update_task_progress(task_id, status="finished")
        else:
            await update_task_progress(task_id, status="finished")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        await update_task_progress(task_id, status="failed", error=f"Критична помилка: {str(e)}\n{error_details}")


async def parse_competitor_categories(task_id: str, competitor_id: str):
    """Асинхронна функція для парсингу категорій конкурента у фоновому режимі"""
    from .gpt_client import GPTClient
    
    try:
        await update_task_progress(task_id, done=0, total=1, status="running")
        
        competitors_db = await load_competitors()
        competitor_data = None
        for c in competitors_db["competitors"]:
            if c["id"] == competitor_id:
                competitor_data = c
                break
        
        if not competitor_data:
            raise Exception("Конкурент не знайдено")
        
        # Отримуємо активний API ключ
        settings = await load_settings()
        api_key_obj = None
        if settings.current_key:
            for key_obj in settings.keys:
                if key_obj.id == settings.current_key and key_obj.active:
                    api_key_obj = key_obj
                    break
        
        if not api_key_obj:
            raise Exception("Немає активного API ключа. Додайте та активуйте ключ у налаштуваннях.")
        
        client = GPTClient(api_key_obj.key)
        categories = client.parse_competitor_categories(competitor_data["url"])
        
        # Оновлюємо категорії конкурента
        competitor_data["categories"] = categories
        competitor_data["last_parsed"] = datetime.now().isoformat()
        
        await save_competitors(competitors_db)
        await update_task_progress(task_id, done=1, total=1, status="finished")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        await update_task_progress(task_id, done=1, total=1, status="failed", error=f"{str(e)}\n{error_details}")


async def update_competitor_categories(task_id: str, competitor_id: str):
    """Асинхронна функція для оновлення категорій конкурента з порівнянням старих та нових"""
    from .gpt_client import GPTClient
    
    try:
        await update_task_progress(task_id, done=0, total=1, status="running")
        
        competitors_db = await load_competitors()
        competitor_data = None
        for c in competitors_db["competitors"]:
            if c["id"] == competitor_id:
                competitor_data = c
                break
        
        if not competitor_data:
            raise Exception("Конкурент не знайдено")
        
        # Отримуємо активний API ключ
        settings = await load_settings()
        api_key_obj = None
        if settings.current_key:
            for key_obj in settings.keys:
                if key_obj.id == settings.current_key and key_obj.active:
                    api_key_obj = key_obj
                    break
        
        if not api_key_obj:
            raise Exception("Немає активного API ключа. Додайте та активуйте ключ у налаштуваннях.")
        
        # Зберігаємо старі категорії для порівняння
        old_categories = competitor_data.get("categories", [])
        logger.info(f"Початок оновлення категорій для конкурента {competitor_id}. Старих категорій: {len(old_categories)}")
        
        # Парсимо нові категорії
        logger.info(f"Запуск парсингу категорій з URL: {competitor_data['url']}")
        try:
            client = GPTClient(api_key_obj.key)
            new_categories = client.parse_competitor_categories(competitor_data["url"])
            logger.info(f"Парсинг завершено. Знайдено нових категорій: {len(new_categories)}")
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            error_message = f"Помилка парсингу категорій: {str(e)}"
            logger.error(f"{error_message}\n{error_details}")
            await update_task_progress(task_id, done=1, total=1, status="failed", error=error_message)
            return
        
        # Якщо старих категорій немає, просто додаємо нові (перший парсинг)
        if not old_categories or len(old_categories) == 0:
            competitor_data["categories"] = new_categories
            competitor_data["last_parsed"] = datetime.now().isoformat()
            await save_competitors(competitors_db)
            
            stats_message = f"Парсинг завершено:\n"
            stats_message += f"➕ Додано: {len(new_categories)} категорій"
            
            await update_task_progress(task_id, done=1, total=1, status="finished", error=stats_message)
            logger.info(f"Перший парсинг категорій завершено: додано {len(new_categories)} категорій")
            return
        
        # Порівнюємо та оновлюємо категорії
        def get_all_categories_flat(categories_list, parent_path=""):
            """Рекурсивно збирає всі категорії у плоский список з шляхом"""
            result = []
            for cat in categories_list:
                current_path = f"{parent_path}/{cat.get('id', '')}" if parent_path else cat.get('id', '')
                result.append({
                    'id': cat.get('id'),
                    'name': cat.get('name'),
                    'url': cat.get('url'),
                    'path': current_path,
                    'full_data': cat
                })
                if cat.get('children'):
                    result.extend(get_all_categories_flat(cat['children'], current_path))
            return result
        
        old_categories_flat = get_all_categories_flat(old_categories)
        new_categories_flat = get_all_categories_flat(new_categories)
        
        # Створюємо словники для швидкого пошуку
        old_by_id = {cat['id']: cat for cat in old_categories_flat if cat['id']}
        old_by_url = {cat['url']: cat for cat in old_categories_flat if cat.get('url')}
        old_by_name = {cat['name'].lower(): cat for cat in old_categories_flat if cat.get('name')}
        
        # Статистика змін
        stats = {
            'found': 0,  # Категорії знайдені (без змін)
            'not_found': 0,  # Категорії не знайдені (потрібна ручна перевірка)
            'new': 0,  # Нові категорії
            'not_found_list': []  # Список незнайдених категорій
        }
        
        def merge_categories(old_list, new_list):
            """Рекурсивно об'єднує старі та нові категорії"""
            result = []
            
            # Створюємо словник нових категорій для швидкого пошуку
            new_by_id = {cat.get('id'): cat for cat in new_list if cat.get('id')}
            
            # Спочатку обробляємо старі категорії
            for old_cat in old_list:
                old_id = old_cat.get('id')
                old_name = old_cat.get('name', '').lower()
                old_url = old_cat.get('url', '')
                
                # Шукаємо відповідну нову категорію
                found = False
                if old_id and old_id in new_by_id:
                    # Знайдено за ID
                    new_cat = new_by_id[old_id]
                    merged_cat = new_cat.copy()
                    # Обробляємо дочірні категорії рекурсивно
                    if old_cat.get('children') and new_cat.get('children'):
                        merged_cat['children'] = merge_categories(old_cat['children'], new_cat['children'])
                    elif old_cat.get('children'):
                        # Старі дочірні категорії, але нових немає - позначаємо як незнайдені
                        merged_cat['children'] = mark_not_found(old_cat['children'])
                    else:
                        merged_cat['children'] = new_cat.get('children', [])
                    result.append(merged_cat)
                    stats['found'] += 1
                    found = True
                elif old_url and old_url in old_by_url:
                    # Шукаємо за URL
                    for new_cat in new_list:
                        if new_cat.get('url') == old_url:
                            merged_cat = new_cat.copy()
                            if old_cat.get('children') and new_cat.get('children'):
                                merged_cat['children'] = merge_categories(old_cat['children'], new_cat['children'])
                            elif old_cat.get('children'):
                                merged_cat['children'] = mark_not_found(old_cat['children'])
                            else:
                                merged_cat['children'] = new_cat.get('children', [])
                            result.append(merged_cat)
                            stats['found'] += 1
                            found = True
                            break
                elif old_name and old_name in old_by_name:
                    # Шукаємо за назвою (менш надійно)
                    for new_cat in new_list:
                        if new_cat.get('name', '').lower() == old_name:
                            merged_cat = new_cat.copy()
                            if old_cat.get('children') and new_cat.get('children'):
                                merged_cat['children'] = merge_categories(old_cat['children'], new_cat['children'])
                            elif old_cat.get('children'):
                                merged_cat['children'] = mark_not_found(old_cat['children'])
                            else:
                                merged_cat['children'] = new_cat.get('children', [])
                            result.append(merged_cat)
                            stats['found'] += 1
                            found = True
                            break
                
                if not found:
                    # Категорія не знайдена - позначаємо для ручної перевірки
                    not_found_cat = old_cat.copy()
                    not_found_cat['needs_manual_check'] = True
                    if old_cat.get('children'):
                        not_found_cat['children'] = mark_not_found(old_cat['children'])
                    result.append(not_found_cat)
                    stats['not_found'] += 1
                    stats['not_found_list'].append({
                        'id': old_id,
                        'name': old_cat.get('name'),
                        'url': old_url
                    })
            
            # Додаємо нові категорії, яких не було в старих
            old_ids = {cat.get('id') for cat in old_list if cat.get('id')}
            old_urls = {cat.get('url') for cat in old_list if cat.get('url')}
            old_names = {cat.get('name', '').lower() for cat in old_list if cat.get('name')}
            
            for new_cat in new_list:
                new_id = new_cat.get('id')
                new_url = new_cat.get('url', '')
                new_name = new_cat.get('name', '').lower()
                
                is_new = (
                    (not new_id or new_id not in old_ids) and
                    (not new_url or new_url not in old_urls) and
                    (not new_name or new_name not in old_names)
                )
                
                if is_new:
                    # Це нова категорія
                    merged_cat = new_cat.copy()
                    if new_cat.get('children'):
                        merged_cat['children'] = merge_categories([], new_cat['children'])
                    result.append(merged_cat)
                    stats['new'] += 1
            
            return result
        
        def mark_not_found(categories_list):
            """Позначає категорії як незнайдені"""
            result = []
            for cat in categories_list:
                not_found_cat = cat.copy()
                not_found_cat['needs_manual_check'] = True
                if cat.get('children'):
                    not_found_cat['children'] = mark_not_found(cat['children'])
                result.append(not_found_cat)
                stats['not_found'] += 1
                stats['not_found_list'].append({
                    'id': cat.get('id'),
                    'name': cat.get('name'),
                    'url': cat.get('url')
                })
            return result
        
        # Об'єднуємо категорії
        merged_categories = merge_categories(old_categories, new_categories)
        
        # Оновлюємо категорії конкурента
        competitor_data["categories"] = merged_categories
        competitor_data["last_parsed"] = datetime.now().isoformat()
        
        await save_competitors(competitors_db)
        
        # Зберігаємо статистику в прогрес для відображення користувачу
        stats_message = f"Оновлення завершено:\n"
        stats_message += f"✓ Знайдено: {stats['found']} категорій\n"
        stats_message += f"✗ Не знайдено (потрібна перевірка): {stats['not_found']} категорій\n"
        stats_message += f"➕ Додано нових: {stats['new']} категорій"
        
        if stats['not_found'] > 0:
            stats_message += f"\n\nНезнайдені категорії (позначені для ручної перевірки):"
            for nf in stats['not_found_list'][:10]:  # Показуємо перші 10
                stats_message += f"\n- {nf.get('name', 'Без назви')} (ID: {nf.get('id', 'N/A')})"
            if len(stats['not_found_list']) > 10:
                stats_message += f"\n... та ще {len(stats['not_found_list']) - 10} категорій"
        
        await update_task_progress(task_id, done=1, total=1, status="finished", error=stats_message)
        
        logger.info(f"Оновлення категорій завершено: знайдено={stats['found']}, не знайдено={stats['not_found']}, нових={stats['new']}")
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        await update_task_progress(task_id, done=1, total=1, status="failed", error=f"{str(e)}\n{error_details}")


async def discover_products(task_id: str, competitor_id: str, category_ids: list):
    """Асинхронна функція для пошуку товарів у вибраних категоріях"""
    from .gpt_client import GPTClient
    import uuid
    
    logger.info(f"Початок discover_products: task_id={task_id}, competitor_id={competitor_id}, category_ids={category_ids}")
    
    try:
        # Завантажуємо дані конкурента
        competitors_db = await load_competitors()
        competitor_data = None
        for c in competitors_db["competitors"]:
            if c["id"] == competitor_id:
                competitor_data = c
                break
        
        if not competitor_data:
            raise Exception("Конкурент не знайдено")
        
        # Отримуємо активний API ключ
        settings = await load_settings()
        api_key_obj = None
        if settings.current_key:
            for key_obj in settings.keys:
                if key_obj.id == settings.current_key and key_obj.active:
                    api_key_obj = key_obj
                    break
        
        if not api_key_obj:
            raise Exception("Немає активного API ключа. Додайте та активуйте ключ у налаштуваннях.")
        
        client = GPTClient(api_key_obj.key)
        
        # Знаходимо категорії за ID (рекурсивно)
        def find_categories_by_ids(categories, ids):
            """Рекурсивно знаходить категорії за ID"""
            found = []
            for cat in categories:
                if cat.get("id") in ids:
                    found.append(cat)
                if cat.get("children"):
                    found.extend(find_categories_by_ids(cat["children"], ids))
            return found
        
        selected_categories = find_categories_by_ids(competitor_data.get("categories", []), category_ids)
        
        if not selected_categories:
            raise Exception("Категорії не знайдено")
        
        total_categories = len(selected_categories)
        
        # Переконуємося, що задача ініціалізована в progress.json
        progress = await load_progress()
        if task_id not in progress["tasks"]:
            logger.warning(f"Задача {task_id} не знайдена в progress.json, створюємо...")
            progress["tasks"][task_id] = {
                "type": "discover_products",
                "total": total_categories,
                "done": 0,
                "errors": [],
                "status": "running"
            }
            await save_progress(progress)
            logger.info(f"Задача {task_id} створена в progress.json")
        
        await update_task_progress(task_id, done=0, total=total_categories, status="running")
        logger.info(f"Прогрес оновлено: task_id={task_id}, total={total_categories}")
        
        # Завантажуємо базу товарів
        db = await load_db()
        existing_urls = {p.get("url") for p in db["products"] if p.get("url")}
        
        all_products = []
        success_count = 0
        error_count = 0
        
        # Парсимо товари з кожної категорії
        for idx, category in enumerate(selected_categories):
            try:
                category_url = category.get("url")
                if not category_url:
                    error_count += 1
                    await update_task_progress(
                        task_id, 
                        done=idx + 1, 
                        total=total_categories,
                        error=f"Категорія '{category.get('name', 'unknown')}': URL відсутній"
                    )
                    continue
                
                # Парсимо товари з категорії
                logger.info(f"Парсинг товарів з категорії: {category.get('name')} ({category_url})")
                products = client.parse_category_products(category_url)
                logger.info(f"GPT знайшов {len(products)} товарів у категорії '{category.get('name')}'")
                
                # Формуємо category_path для товарів (спрощена версія - використовуємо назву категорії)
                category_path = [category.get("name", "")]
                
                # Додаємо товари до списку
                products_added_count = 0
                for product in products:
                    product_url = product.get("url")
                    if not product_url:
                        continue  # Пропускаємо товари без URL
                    
                    if product_url not in existing_urls:
                        # Створюємо новий товар
                        new_product = {
                            "id": str(uuid.uuid4()),
                            "name": product.get("name") or "Товар без назви",
                            "url": product_url,
                            "status": "pending",
                            "name_parsed": product.get("name"),
                            "sku": product.get("sku"),
                            "price": product.get("price"),
                            "availability": product.get("availability"),
                            "competitor_name": competitor_data.get("name"),
                            "competitor_id": competitor_id,
                            "category_path": category_path,
                            "from_category_discovery": True,
                            "history": [],
                            "created_at": datetime.now().isoformat(),
                            "last_parsed_at": None
                        }
                        all_products.append(new_product)
                        existing_urls.add(product_url)
                        products_added_count += 1
                        logger.info(f"Додано товар: {new_product['name']} ({product_url})")
                    else:
                        logger.info(f"Товар вже існує, пропущено: {product_url}")
                
                logger.info(f"З категорії '{category.get('name')}' додано {products_added_count} нових товарів (всього знайдено: {len(products)})")
                success_count += 1
                await update_task_progress(task_id, done=idx + 1, total=total_categories)
                
            except Exception as e:
                error_count += 1
                import traceback
                error_details = traceback.format_exc()
                error_msg = f"Категорія '{category.get('name', 'unknown')}': {str(e)}"
                logger.error(f"Помилка парсингу категорії '{category.get('name', 'unknown')}': {str(e)}")
                logger.error(f"Деталі помилки: {error_details}")
                await update_task_progress(
                    task_id,
                    done=idx + 1,
                    total=total_categories,
                    error=error_msg
                )
                # Продовжуємо обробку наступних категорій навіть якщо поточна не вдалася
                continue
        
        # Зберігаємо всі знайдені товари
        logger.info(f"Всього знайдено товарів для збереження: {len(all_products)}")
        if all_products:
            initial_count = len(db["products"])
            db["products"].extend(all_products)
            await save_db(db)
            logger.info(f"Збережено {len(all_products)} нових товарів у базу даних (було: {initial_count}, стало: {len(db['products'])})")
            
            # Перевіряємо, чи товари дійсно збережені
            db_check = await load_db()
            logger.info(f"Перевірка: у базі даних тепер {len(db_check['products'])} товарів")
            
            # Логуємо перші 5 товарів для перевірки
            if len(all_products) > 0:
                logger.info("Перші знайдені товари:")
                for i, p in enumerate(all_products[:5]):
                    logger.info(f"  {i+1}. {p.get('name')} - {p.get('url')}")
        else:
            logger.warning("НЕ ЗНАЙДЕНО ЖОДНОГО ТОВАРУ ДЛЯ ЗБЕРЕЖЕННЯ!")
            logger.warning(f"Успішно оброблено категорій: {success_count}, помилок: {error_count}")
        
        # Зберігаємо кількість знайдених товарів у прогрес для відображення
        products_count = len(all_products)
        logger.info(f"Підсумок discover_products: знайдено {products_count} товарів, успішно оброблено {success_count} категорій, помилок: {error_count}")
        
        # Визначаємо фінальний статус
        if error_count > 0 and success_count == 0:
            # Всі категорії з помилками
            error_summary = f"Всі категорії оброблено з помилками. Знайдено товарів: {products_count}"
            logger.warning(f"discover_products завершено з помилками: {error_summary}")
            await update_task_progress(task_id, status="failed", error=error_summary)
        elif error_count > 0:
            # Є помилки, але є і успішні
            error_summary = f"Оброблено {success_count} з {total_categories} категорій. Знайдено товарів: {products_count}"
            logger.warning(f"discover_products завершено з частковими помилками: {error_summary}")
            # Додаємо інформацію про кількість товарів у прогрес
            progress = await load_progress()
            if task_id in progress["tasks"]:
                progress["tasks"][task_id]["products_found"] = products_count
                await save_progress(progress)
            await update_task_progress(task_id, status="finished")
        else:
            # Всі успішні
            logger.info(f"discover_products успішно завершено: знайдено {products_count} товарів")
            # Додаємо інформацію про кількість товарів у прогрес
            progress = await load_progress()
            if task_id in progress["tasks"]:
                progress["tasks"][task_id]["products_found"] = products_count
                await save_progress(progress)
            await update_task_progress(task_id, status="finished")
        
        # Автоматично запускаємо парсинг нових товарів (якщо є товари)
        if all_products:
            try:
                parse_task_id = str(uuid.uuid4())
                # Ініціалізуємо прогрес для нової задачі
                progress = await load_progress()
                progress["tasks"][parse_task_id] = {
                    "type": "parse_newly_discovered_products",
                    "total": len(all_products),
                    "done": 0,
                    "errors": [],
                    "status": "running"
                }
                await save_progress(progress)
                
                # Запускаємо фонову задачу
                import asyncio
                asyncio.create_task(parse_newly_discovered_products(parse_task_id))
                logger.info(f"Запущено автоматичний парсинг {len(all_products)} нових товарів (task_id={parse_task_id})")
            except Exception as e:
                logger.error(f"Помилка запуску автоматичного парсингу нових товарів: {str(e)}")
                # Не блокуємо основну задачу, якщо не вдалося запустити парсинг
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        await update_task_progress(task_id, status="failed", error=f"Критична помилка: {str(e)}\n{error_details}")


async def parse_newly_discovered_products(task_id: str):
    """Асинхронна функція для парсингу нових знайдених товарів"""
    try:
        db = await load_db()
        
        # Знаходимо всі товари, у яких name або price = null та from_category_discovery = true
        products_to_parse = [
            p for p in db["products"]
            if p.get("from_category_discovery") and (p.get("name_parsed") is None or p.get("price") is None)
        ]
        
        total = len(products_to_parse)
        
        if total == 0:
            await update_task_progress(task_id, done=0, total=0, status="finished")
            return
        
        await update_task_progress(task_id, done=0, total=total, status="running")
        
        success_count = 0
        error_count = 0
        
        for idx, product_data in enumerate(products_to_parse):
            try:
                product = Product(**product_data)
                # Виконуємо повний парсинг
                parsed_data = await parse_product_full(product)
                await save_result(product.id, parsed_data)
                success_count += 1
                await update_task_progress(task_id, done=idx + 1, total=total)
            except Exception as e:
                error_count += 1
                error_msg = f"Товар {product_data.get('name', product_data.get('id', 'unknown'))}: {str(e)}"
                await update_task_progress(task_id, done=idx + 1, total=total, error=error_msg)
        
        # Визначаємо фінальний статус
        if error_count > 0 and success_count == 0:
            await update_task_progress(task_id, status="failed")
        else:
            await update_task_progress(task_id, status="finished")
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        await update_task_progress(task_id, status="failed", error=f"Критична помилка: {str(e)}\n{error_details}")


# ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ХАРАКТЕРИСТИКАМИ ==========

async def load_characteristics() -> Dict:
    """Завантажує базу даних характеристик (асинхронно)"""
    try:
        async with aiofiles.open(CHARACTERISTICS_FILE, "r", encoding="utf-8") as f:
            content = await f.read()
            return json.loads(content)
    except FileNotFoundError:
        return {
            "groups": [],
            "characteristics": [],
            "product_characteristics": {}  # {product_id: [CharacteristicValue]}
        }
    except Exception as e:
        logger.error(f"Помилка завантаження характеристик: {e}")
        return {
            "groups": [],
            "characteristics": [],
            "product_characteristics": {}
        }


async def save_characteristics(data: Dict):
    """Зберігає базу даних характеристик (асинхронно)"""
    os.makedirs(os.path.dirname(CHARACTERISTICS_FILE), exist_ok=True)
    async with aiofiles.open(CHARACTERISTICS_FILE, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, ensure_ascii=False, indent=2))


async def get_characteristics_for_product(product_id: str, category_path: List[str] = None) -> List[Dict]:
    """Отримує характеристики для товару з урахуванням категорії
    
    Логіка:
    1. Знаходимо групи характеристик, які відповідають категоріям товару
    2. Знаходимо характеристики, які належать до цих груп
    3. Також додаємо характеристики без груп, якщо вони відповідають категоріям товару
    """
    characteristics_db = await load_characteristics()
    
    # Отримуємо всі характеристики та групи
    all_characteristics = characteristics_db.get("characteristics", [])
    all_groups = characteristics_db.get("groups", [])
    
    # Фільтруємо характеристики за категорією через групи
    if category_path:
        logger.info(f"Фільтрація характеристик для категорій товару: {category_path}")
        
        # Крок 1: Знаходимо групи, які відповідають категоріям товару
        matching_group_ids = set()
        
        # Нормалізуємо категорії товару (видаляємо competitorId: якщо є)
        product_cats_normalized = []
        product_cats_all_parts = []  # Всі частини категорій (для перевірки "Дизельні мотоблоки" в "Мотоблоки > Дизельні мотоблоки")
        for product_cat in category_path:
            if ':' in product_cat:
                cat_clean = product_cat.split(':', 1)[1]
            else:
                cat_clean = product_cat
            product_cats_normalized.append(cat_clean)
            # Додаємо всі частини категорії (якщо це шлях типу "Мотоблоки > Дизельні мотоблоки")
            if ' > ' in cat_clean:
                parts = cat_clean.split(' > ')
                product_cats_all_parts.extend([p.strip() for p in parts])
            else:
                product_cats_all_parts.append(cat_clean.strip())
        
        for group in all_groups:
            group_categories = group.get("category_path", [])
            # Якщо у групи немає категорій - вона для всіх товарів
            if not group_categories:
                matching_group_ids.add(group["id"])
                logger.debug(f"Група '{group.get('name')}' без категорій - додаємо")
                continue
            
            # Перевіряємо збіг категорій групи з категоріями товару
            matches = False
            for group_cat in group_categories:
                # Нормалізуємо категорію групи
                if ':' in group_cat:
                    group_cat_normalized = group_cat.split(':', 1)[1]
                else:
                    group_cat_normalized = group_cat
                
                # Перевіряємо точне збігання
                if group_cat_normalized in product_cats_normalized:
                    matches = True
                    logger.debug(f"Точне збігання: '{group_cat_normalized}' в {product_cats_normalized}")
                    break
                
                # Перевіряємо, чи категорія групи є частиною категорії товару
                # Наприклад: "Дизельні мотоблоки" в "Мотоблоки > Дизельні мотоблоки"
                for product_cat_norm in product_cats_normalized:
                    if product_cat_norm == group_cat_normalized:
                        matches = True
                        logger.debug(f"Точне збігання: '{product_cat_norm}' == '{group_cat_normalized}'")
                        break
                    # Перевіряємо, чи категорія групи міститься в шляху товару
                    if ' > ' in product_cat_norm:
                        if group_cat_normalized in product_cat_norm:
                            matches = True
                            logger.debug(f"Збігання в шляху товару: '{group_cat_normalized}' в '{product_cat_norm}'")
                            break
                    # Перевіряємо, чи категорія товару міститься в шляху групи
                    if ' > ' in group_cat_normalized:
                        if product_cat_norm in group_cat_normalized:
                            matches = True
                            logger.debug(f"Збігання в шляху групи: '{product_cat_norm}' в '{group_cat_normalized}'")
                            break
                    # Перевіряємо всі частини категорій товару
                    if group_cat_normalized in product_cats_all_parts:
                        matches = True
                        logger.debug(f"Збігання з частиною категорії товару: '{group_cat_normalized}' в {product_cats_all_parts}")
                        break
                if matches:
                    break
                
                # Перевіряємо всі частини категорії групи (якщо це шлях)
                if ' > ' in group_cat_normalized:
                    group_parts = [p.strip() for p in group_cat_normalized.split(' > ')]
                    for group_part in group_parts:
                        if group_part in product_cats_normalized or group_part in product_cats_all_parts:
                            matches = True
                            logger.debug(f"Збігання з частиною категорії групи: '{group_part}' в категоріях товару")
                            break
                    if matches:
                        break
                
                # Перевіряємо повний шлях (якщо категорія товару - це шлях типу "Мотоблоки > Дизельні мотоблоки")
                for product_cat_full in category_path:
                    # Нормалізуємо повний шлях товару
                    if ':' in product_cat_full:
                        product_cat_full_clean = product_cat_full.split(':', 1)[1]
                    else:
                        product_cat_full_clean = product_cat_full
                    
                    if group_cat_normalized in product_cat_full_clean:
                        matches = True
                        logger.debug(f"Збігання в повному шляху товару: '{group_cat_normalized}' в '{product_cat_full_clean}'")
                        break
                    if product_cat_full_clean in group_cat_normalized:
                        matches = True
                        logger.debug(f"Збігання в повному шляху групи: '{product_cat_full_clean}' в '{group_cat_normalized}'")
                        break
                if matches:
                    break
            
            if matches:
                matching_group_ids.add(group["id"])
                logger.debug(f"Група '{group.get('name')}' відповідає категоріям товару")
        
        logger.info(f"Знайдено {len(matching_group_ids)} груп, що відповідають категоріям товару")
        
        # Крок 2: Знаходимо характеристики, які належать до відповідних груп
        filtered_characteristics = []
        for char in all_characteristics:
            char_group_id = char.get("group_id")
            
            # Якщо характеристика належить до відповідної групи - додаємо
            if char_group_id and char_group_id in matching_group_ids:
                logger.debug(f"Характеристика '{char.get('name')}' належить до відповідної групи")
                filtered_characteristics.append(char)
                continue
            
            # Якщо характеристика без групи - перевіряємо її категорії напряму
            if not char_group_id:
                char_categories = char.get("category_path", [])
                # Якщо у характеристики немає категорій - показуємо для всіх
                if not char_categories:
                    logger.debug(f"Характеристика '{char.get('name')}' без групи та категорій - додаємо")
                    filtered_characteristics.append(char)
                    continue
                
                # Перевіряємо збіг категорій характеристики з категоріями товару
                matches = False
                for char_cat in char_categories:
                    # Нормалізуємо категорію характеристики
                    if ':' in char_cat:
                        char_cat_normalized = char_cat.split(':', 1)[1]
                    else:
                        char_cat_normalized = char_cat
                    
                    # Перевіряємо точне збігання
                    if char_cat_normalized in product_cats_normalized:
                        matches = True
                        break
                    
                    # Перевіряємо часткове збігання
                    for product_cat_norm in product_cats_normalized:
                        if product_cat_norm == char_cat_normalized or product_cat_norm in char_cat_normalized or char_cat_normalized in product_cat_norm:
                            matches = True
                            break
                    if matches:
                        break
                    
                    # Перевіряємо повний шлях
                    for product_cat_full in category_path:
                        if char_cat_normalized in product_cat_full or product_cat_full in char_cat_normalized:
                            matches = True
                            break
                    if matches:
                        break
                
                if matches:
                    logger.debug(f"Характеристика '{char.get('name')}' без групи відповідає категоріям товару")
                    filtered_characteristics.append(char)
        logger.info(f"Знайдено {len(filtered_characteristics)} характеристик для товару з {len(all_characteristics)} загальних")
        if len(filtered_characteristics) > 0:
            logger.info(f"Знайдені характеристики: {[char.get('name') for char in filtered_characteristics]}")
        all_characteristics = filtered_characteristics
    else:
        logger.info(f"Категорії товару не вказано, показуємо всі {len(all_characteristics)} характеристик")
    
    # Групуємо характеристики за групами
    groups = characteristics_db.get("groups", [])
    groups_dict = {g["id"]: g for g in groups}
    
    # Додаємо інформацію про групу до кожної характеристики
    for char in all_characteristics:
        group_id = char.get("group_id")
        if group_id and group_id in groups_dict:
            char["group"] = groups_dict[group_id]
        else:
            char["group"] = None
    
    # Сортуємо за пріоритетом та групою
    all_characteristics.sort(key=lambda x: (
        x.get("group_id") or "",
        x.get("priority", 2),
        x.get("name", "")
    ))
    
    return all_characteristics


async def get_product_characteristic_values(product_id: str) -> Dict[str, Dict]:
    """Отримує значення характеристик для товару"""
    characteristics_db = await load_characteristics()
    product_chars = characteristics_db.get("product_characteristics", {}).get(product_id, [])
    
    # Конвертуємо список у словник для зручності
    result = {}
    for char_value in product_chars:
        result[char_value["characteristic_id"]] = char_value
    
    return result