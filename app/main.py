from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import json
import os
import uuid
import asyncio
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
from .models import (
    Product, ProductAdd, APIKeyAdd, Settings, APIKey, Competitor, CompetitorAdd, DiscoverProductsRequest,
    CharacteristicGroup, Characteristic, CharacteristicValue, ProductCharacteristics,
    CharacteristicGroupAdd, CharacteristicAdd, CharacteristicValueAdd
)
from .parser import (
    load_db, save_db, load_settings, save_settings,
    parse_product, parse_product_full, save_result, is_first_parse, get_active_api_key,
    get_token_statistics, save_token_usage, load_competitors, save_competitors,
    parse_all_products, parse_single_product, parse_competitor_categories,
    update_competitor_categories, discover_products, parse_newly_discovered_products,
    parse_filtered_products, parse_selected_products,
    load_progress, save_progress, get_task_status,
    load_characteristics, save_characteristics, get_characteristics_for_product, get_product_characteristic_values
)

app = FastAPI(title="GPT Product Parser")

# CORS для фронтенду
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Статичні файли
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Головна сторінка"""
    with open("app/templates/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.get("/settings", response_class=HTMLResponse)
async def settings_page():
    """Сторінка налаштувань"""
    with open("app/templates/settings.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.get("/competitors", response_class=HTMLResponse)
async def competitors_page():
    """Сторінка конкурентів"""
    with open("app/templates/competitors.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())




# ========== API ENDPOINTS ДЛЯ ТОВАРІВ ==========

@app.post("/products/add")
async def add_product(product: ProductAdd):
    """Додати новий товар"""
    db = await load_db()
    
    new_product = {
        "id": str(uuid.uuid4()),
        "name": product.name,
        "url": product.url,
        "status": "pending",
        "name_parsed": None,
        "sku": None,
        "price": None,
        "availability": None,
        "history": [],
        "created_at": datetime.now().isoformat(),
        "last_parsed_at": None
    }
    
    db["products"].append(new_product)
    await save_db(db)
    
    return {"success": True, "product": new_product}


@app.get("/products/list")
async def list_products(
    name: Optional[str] = None,
    competitor_id: Optional[str] = None,
    category_ids: Optional[List[str]] = Query(None),
    status: Optional[str] = None,
    availability: Optional[str] = None,
    price_from: Optional[float] = None,
    price_to: Optional[float] = None,
    problematic: Optional[bool] = None
):
    """Отримати список товарів з фільтрами"""
    try:
        db = await load_db()
        products = db.get("products", [])
    except Exception as e:
        import traceback
        print(f"Помилка завантаження бази даних: {e}")
        print(traceback.format_exc())
        return {"products": []}
    
    # Застосовуємо фільтри
    filtered = products
    
    # Фільтр по назві
    if name:
        name_lower = name.lower()
        filtered = [p for p in filtered if name_lower in (p.get("name", "") or "").lower() or 
                    name_lower in (p.get("name_parsed", "") or "").lower()]
    
    # Фільтр по конкурентові
    if competitor_id and competitor_id != "all":
        filtered = [p for p in filtered if p.get("competitor_id") == competitor_id]
    
    # Фільтр по категоріях (перевіряємо category_path - шукаємо ID категорій у шляху)
    if category_ids:
        try:
            if isinstance(category_ids, str):
                category_ids = [category_ids]
            # Шукаємо товари, у яких category_path містить хоча б одну з вибраних категорій
            # Для цього потрібно знайти категорії за ID у competitors.json
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
                for cat_id in category_ids:
                    cat_name = find_category_by_id(competitor.get("categories", []), cat_id)
                    if cat_name:
                        category_names.append(cat_name)
            
            if category_names:
                filtered = [p for p in filtered if any(
                    cat_name in (p.get("category_path", []) or []) for cat_name in category_names
                )]
        except Exception as e:
            import traceback
            print(f"Помилка фільтрації по категоріях: {e}")
            print(traceback.format_exc())
            # Продовжуємо без фільтрації по категоріях
    
    # Фільтр по статусу
    if status:
        filtered = [p for p in filtered if p.get("status") == status]
    
    # Фільтр по наявності
    if availability:
        filtered = [p for p in filtered if (p.get("availability") or "").lower() == availability.lower()]
    
    # Фільтр по ціні від
    if price_from is not None:
        filtered = [p for p in filtered if p.get("price") is not None and p.get("price", 0) >= price_from]
    
    # Фільтр по ціні до
    if price_to is not None:
        filtered = [p for p in filtered if p.get("price") is not None and p.get("price", 0) <= price_to]
    
    # Фільтр проблемних товарів (товари з помилками або без ціни/наявності)
    if problematic:
        filtered = [p for p in filtered if (
            p.get("status") == "error" or
            (p.get("status") == "parsed" and (p.get("price") is None or p.get("availability") is None))
        )]
    
    return {"products": filtered}


@app.post("/products/parse_one/{product_id}")
async def parse_one_product(product_id: str):
    """Спарсити один товар"""
    db = await load_db()
    
    product_data = None
    for p in db["products"]:
        if p["id"] == product_id:
            product_data = p
            break
    
    if not product_data:
        raise HTTPException(status_code=404, detail="Товар не знайдено")
    
    product = Product(**product_data)
    
    try:
        parsed_data = await parse_product(product)
        await save_result(product_id, parsed_data)
        
        # Перевіряємо, чи товар не вимкнений конкурентом
        if parsed_data.get("status") == "disabled_by_competitor":
            # Товар вимкнений конкурентом - це не помилка, але повертаємо інформацію
            for p in db["products"]:
                if p["id"] == product_id:
                    return {"success": True, "product": p, "parsed_data": parsed_data, "disabled": True}
        
        # Додаємо лог про успішний парсинг
        for p in db["products"]:
            if p["id"] == product_id:
                if "logs" not in p:
                    p["logs"] = []
                log_entry = {
                    "date": datetime.now().isoformat(),
                    "operation": "parse",
                    "status": "success",
                    "message": f"Товар успішно спарсено. Ціна: {parsed_data.get('price')}, Наявність: {parsed_data.get('availability')}"
                }
                p["logs"].append(log_entry)
                await save_db(db)
                return {"success": True, "product": p, "parsed_data": parsed_data}
        
        return {"success": True, "parsed_data": parsed_data}
    except Exception as e:
        # Оновлюємо статус на помилку та додаємо лог
        for p in db["products"]:
            if p["id"] == product_id:
                p["status"] = "error"
                if "logs" not in p:
                    p["logs"] = []
                log_entry = {
                    "date": datetime.now().isoformat(),
                    "operation": "parse",
                    "status": "error",
                    "message": str(e)
                }
                p["logs"].append(log_entry)
                break
        await save_db(db)
        
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/products/parse_full/{product_id}")
async def parse_full_product(product_id: str):
    """Спарсити товар з повними даними (назва, SKU, ціна, наявність)"""
    db = await load_db()
    
    product_data = None
    for p in db["products"]:
        if p["id"] == product_id:
            product_data = p
            break
    
    if not product_data:
        raise HTTPException(status_code=404, detail="Товар не знайдено")
    
    product = Product(**product_data)
    
    try:
        parsed_data = await parse_product_full(product)
        await save_result(product_id, parsed_data)
        
        # Перезавантажуємо db після збереження, щоб отримати оновлені дані
        db = await load_db()
        
        # Перевіряємо, чи товар не вимкнений конкурентом
        if parsed_data.get("status") == "disabled_by_competitor":
            # Товар вимкнений конкурентом - це не помилка, але повертаємо інформацію
            for p in db["products"]:
                if p["id"] == product_id:
                    return {"success": True, "product": p, "parsed_data": parsed_data, "disabled": True}
        
        # Додаємо лог про успішний парсинг
        for p in db["products"]:
            if p["id"] == product_id:
                if "logs" not in p:
                    p["logs"] = []
                log_entry = {
                    "date": datetime.now().isoformat(),
                    "operation": "parse_full",
                    "status": "success",
                    "message": f"Всі дані товару успішно спарсено. Назва: {parsed_data.get('name')}, SKU: {parsed_data.get('sku')}, Ціна: {parsed_data.get('price')}, Наявність: {parsed_data.get('availability')}"
                }
                p["logs"].append(log_entry)
                await save_db(db)
                return {"success": True, "product": p, "parsed_data": parsed_data}
        
        return {"success": True, "parsed_data": parsed_data}
    except Exception as e:
        # Оновлюємо статус на помилку та додаємо лог
        for p in db["products"]:
            if p["id"] == product_id:
                p["status"] = "error"
                if "logs" not in p:
                    p["logs"] = []
                log_entry = {
                    "date": datetime.now().isoformat(),
                    "operation": "parse_full",
                    "status": "error",
                    "message": str(e)
                }
                p["logs"].append(log_entry)
                break
        await save_db(db)
        
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/products/parse_all")
async def parse_all_products_legacy():
    """Спарсити всі товари (legacy endpoint - використовуйте /tasks/parse_products)"""
    db = await load_db()
    results = []
    
    for product_data in db["products"]:
        product = Product(**product_data)
        try:
            parsed_data = await parse_product(product)
            await save_result(product.id, parsed_data)
            results.append({
                "product_id": product.id,
                "product_name": product.name,
                "success": True,
                "parsed_data": parsed_data
            })
        except Exception as e:
            results.append({
                "product_id": product.id,
                "product_name": product.name,
                "success": False,
                "error": str(e)
            })
    
    return {"results": results}


# ========== API ENDPOINTS ДЛЯ НАЛАШТУВАНЬ ==========

@app.get("/settings/keys")
async def get_keys():
    """Отримати список API ключів"""
    settings = await load_settings()
    return {
        "keys": [key.dict() for key in settings.keys],
        "current_key": settings.current_key
    }


@app.post("/settings/add_key")
async def add_key(key_data: APIKeyAdd):
    """Додати новий API ключ"""
    settings = await load_settings()
    
    new_key = APIKey(
        id=str(uuid.uuid4()),
        name=key_data.name,
        key=key_data.key,
        active=False
    )
    
    settings.keys.append(new_key)
    await save_settings(settings)
    
    return {"success": True, "key": new_key.dict()}


@app.post("/settings/activate_key/{key_id}")
async def activate_key(key_id: str):
    """Активувати API ключ"""
    settings = await load_settings()
    
    # Деактивуємо всі ключі
    for key in settings.keys:
        key.active = False
    
    # Активуємо вибраний ключ
    found = False
    for key in settings.keys:
        if key.id == key_id:
            key.active = True
            settings.current_key = key_id
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail="Ключ не знайдено")
    
    await save_settings(settings)
    return {"success": True, "current_key": settings.current_key}


@app.delete("/settings/delete_key/{key_id}")
async def delete_key(key_id: str):
    """Видалити API ключ"""
    settings = await load_settings()
    
    # Не можна видалити активний ключ
    if settings.current_key == key_id:
        raise HTTPException(
            status_code=400,
            detail="Не можна видалити активний ключ. Спочатку активуйте інший."
        )
    
    settings.keys = [k for k in settings.keys if k.id != key_id]
    
    # Якщо видалений ключ був поточним, очищаємо
    if settings.current_key == key_id:
        settings.current_key = None
    
    await save_settings(settings)
    return {"success": True}


@app.get("/settings/token_stats/{key_id}")
async def get_token_stats(key_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Отримати статистику використання токенів для API ключа"""
    stats = await get_token_statistics(key_id, start_date, end_date)
    return stats


@app.get("/product/{product_id}", response_class=HTMLResponse)
async def product_page(product_id: str):
    """Сторінка детального перегляду товару"""
    with open("app/templates/product.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.get("/products/{product_id}")
async def get_product(product_id: str):
    """Отримати детальну інформацію про товар"""
    db = await load_db()
    
    product_data = None
    for p in db["products"]:
        if p["id"] == product_id:
            product_data = p
            break
    
    if not product_data:
        raise HTTPException(status_code=404, detail="Товар не знайдено")
    
    # Формуємо відповідь з усіма даними
    # Використовуємо name_parsed, якщо він є, інакше name
    product_name = product_data.get("name_parsed") or product_data.get("name")
    
    response = {
        "id": product_data.get("id"),
        "name": product_name,
        "sku": product_data.get("sku"),
        "url": product_data.get("url"),
        "competitor_name": product_data.get("competitor_name"),
        "competitor_id": product_data.get("competitor_id"),  # Додаємо competitor_id
        "category_path": product_data.get("category_path", []),
        "latest": {
            "price": product_data.get("price"),
            "availability": product_data.get("availability"),
            "updated_at": product_data.get("last_parsed_at")
        },
        "history": product_data.get("history", []),
        "parsing_rules": product_data.get("parsing_rules"),
        "logs": product_data.get("logs", [])
    }
    
    return response


@app.post("/products/regenerate_rules/{product_id}")
async def regenerate_rules(product_id: str):
    """Регенерувати правила парсингу для товару"""
    from .gpt_client import GPTClient
    
    db = await load_db()
    
    product_data = None
    for p in db["products"]:
        if p["id"] == product_id:
            product_data = p
            break
    
    if not product_data:
        raise HTTPException(status_code=404, detail="Товар не знайдено")
    
    # Отримуємо активний API ключ
    settings = await load_settings()
    api_key_obj = None
    if settings.current_key:
        for key_obj in settings.keys:
            if key_obj.id == settings.current_key and key_obj.active:
                api_key_obj = key_obj
                break
    
    if not api_key_obj:
        raise HTTPException(status_code=400, detail="Немає активного API ключа")
    
    try:
        client = GPTClient(api_key_obj.key)
        
        # Формуємо існуючі дані для контексту
        existing_data = {
            "name": product_data.get("name_parsed"),
            "sku": product_data.get("sku"),
            "price": product_data.get("price"),
            "availability": product_data.get("availability")
        }
        
        # Генеруємо нові правила
        rules = client.generate_parsing_rules(product_data["url"], existing_data)
        
        # Видаляємо токени з правил перед збереженням
        token_usage = rules.pop("_token_usage", None)
        if token_usage:
            await save_token_usage(api_key_obj.id, token_usage)
        
        # Зберігаємо правила
        product_data["parsing_rules"] = rules
        await save_db(db)
        
        # Додаємо лог
        log_entry = {
            "date": datetime.now().isoformat(),
            "operation": "regenerate_rules",
            "status": "success",
            "message": "Правила парсингу успішно регенеровано"
        }
        if "logs" not in product_data:
            product_data["logs"] = []
        product_data["logs"].append(log_entry)
        await save_db(db)
        
        return {"success": True, "rules": rules}
    except Exception as e:
        # Додаємо лог про помилку
        log_entry = {
            "date": datetime.now().isoformat(),
            "operation": "regenerate_rules",
            "status": "error",
            "message": str(e)
        }
        if "logs" not in product_data:
            product_data["logs"] = []
        product_data["logs"].append(log_entry)
        await save_db(db)
        
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/products/test_rules/{product_id}")
async def test_rules(product_id: str):
    """Тестувати правила парсингу для товару"""
    from .gpt_client import GPTClient
    
    db = await load_db()
    
    product_data = None
    for p in db["products"]:
        if p["id"] == product_id:
            product_data = p
            break
    
    if not product_data:
        raise HTTPException(status_code=404, detail="Товар не знайдено")
    
    rules = product_data.get("parsing_rules")
    if not rules:
        raise HTTPException(status_code=400, detail="Правила парсингу не знайдено. Спочатку регенеруйте правила.")
    
    # Отримуємо активний API ключ
    settings = await load_settings()
    api_key_obj = None
    if settings.current_key:
        for key_obj in settings.keys:
            if key_obj.id == settings.current_key and key_obj.active:
                api_key_obj = key_obj
                break
    
    if not api_key_obj:
        raise HTTPException(status_code=400, detail="Немає активного API ключа")
    
    try:
        client = GPTClient(api_key_obj.key)
        result = client.test_parsing_rules(product_data["url"], rules)
        
        # Додаємо лог
        log_entry = {
            "date": datetime.now().isoformat(),
            "operation": "test_rules",
            "status": "success" if result["success"] else "error",
            "message": f"Тест правил: {'успішно' if result['success'] else 'помилки знайдено'}"
        }
        if "logs" not in product_data:
            product_data["logs"] = []
        product_data["logs"].append(log_entry)
        await save_db(db)
        
        return result
    except Exception as e:
        # Додаємо лог про помилку
        log_entry = {
            "date": datetime.now().isoformat(),
            "operation": "test_rules",
            "status": "error",
            "message": str(e)
        }
        if "logs" not in product_data:
            product_data["logs"] = []
        product_data["logs"].append(log_entry)
        await save_db(db)
        
        raise HTTPException(status_code=500, detail=str(e))


# ========== API ENDPOINTS ДЛЯ КОНКУРЕНТІВ ==========

@app.post("/competitors/add")
async def add_competitor(competitor: CompetitorAdd):
    """Додати нового конкурента"""
    competitors_db = await load_competitors()
    
    new_competitor = {
        "id": str(uuid.uuid4()),
        "name": competitor.name,
        "url": competitor.url,
        "categories": [],
        "last_parsed": None,
        "notes": competitor.notes or "",
        "active": True
    }
    
    competitors_db["competitors"].append(new_competitor)
    await save_competitors(competitors_db)
    
    return {"success": True, "competitor": new_competitor}


@app.get("/competitors/list")
async def list_competitors():
    """Отримати список всіх конкурентів"""
    competitors_db = await load_competitors()
    return {"competitors": competitors_db["competitors"]}


@app.get("/competitors/{competitor_id}")
async def get_competitor(competitor_id: str):
    """Отримати детальну інформацію про конкурента"""
    competitors_db = await load_competitors()
    
    competitor_data = None
    for c in competitors_db["competitors"]:
        if c["id"] == competitor_id:
            competitor_data = c
            break
    
    if not competitor_data:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    return competitor_data


@app.get("/competitors/by_name/{competitor_name}")
async def get_competitor_by_name(competitor_name: str):
    """Знайти конкурента за назвою"""
    from urllib.parse import unquote
    competitors_db = await load_competitors()
    
    # Декодуємо URL-encoded назву
    competitor_name = unquote(competitor_name)
    competitor_name_lower = competitor_name.lower().strip()
    
    # Спочатку шукаємо точний збіг
    for c in competitors_db["competitors"]:
        if c["name"].lower().strip() == competitor_name_lower:
            return {"id": c["id"], "name": c["name"]}
    
    # Потім шукаємо частковий збіг (назва містить шукану назву або навпаки)
    for c in competitors_db["competitors"]:
        c_name_lower = c["name"].lower().strip()
        if competitor_name_lower in c_name_lower or c_name_lower in competitor_name_lower:
            return {"id": c["id"], "name": c["name"]}
    
    # Якщо не знайдено, повертаємо None
    return None


@app.get("/competitors/by_category")
async def get_competitor_by_category(category_path: List[str] = Query(None)):
    """Знайти конкурента за категорією товару (category_path)"""
    if not category_path or len(category_path) == 0:
        return None
    
    competitors_db = await load_competitors()
    
    def find_category_in_competitor(categories, search_path):
        """Рекурсивно шукає категорію в дереві категорій конкурента"""
        if not search_path or len(search_path) == 0:
            return False
        
        search_name = search_path[0].lower().strip()
        
        for cat in categories:
            cat_name = cat.get("name", "").lower().strip()
            
            # Перевіряємо точний або частковий збіг
            if cat_name == search_name or search_name in cat_name or cat_name in search_name:
                # Якщо це остання категорія в шляху, знайшли
                if len(search_path) == 1:
                    return True
                # Інакше шукаємо в дочірніх категоріях
                if cat.get("children") and len(cat["children"]) > 0:
                    return find_category_in_competitor(cat["children"], search_path[1:])
                # Якщо немає дочірніх, але шлях продовжується, це не збіг
                return False
            
            # Рекурсивно шукаємо в дочірніх категоріях
            if cat.get("children") and len(cat["children"]) > 0:
                if find_category_in_competitor(cat["children"], search_path):
                    return True
        
        return False
    
    # Шукаємо конкурента, у якого є така категорія
    for competitor in competitors_db.get("competitors", []):
        if not competitor.get("active", True):
            continue
        
        categories = competitor.get("categories", [])
        if find_category_in_competitor(categories, category_path):
            return {"id": competitor["id"], "name": competitor["name"]}
    
    return None


@app.delete("/competitors/{competitor_id}")
async def delete_competitor(competitor_id: str):
    """Видалити конкурента"""
    competitors_db = await load_competitors()
    
    competitors_db["competitors"] = [c for c in competitors_db["competitors"] if c["id"] != competitor_id]
    await save_competitors(competitors_db)
    
    return {"success": True}


@app.post("/competitors/{competitor_id}/parse_categories")
async def parse_competitor_categories(competitor_id: str):
    """Спарсити категорії конкурента"""
    from .gpt_client import GPTClient
    
    competitors_db = await load_competitors()
    
    competitor_data = None
    for c in competitors_db["competitors"]:
        if c["id"] == competitor_id:
            competitor_data = c
            break
    
    if not competitor_data:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    # Отримуємо активний API ключ
    settings = await load_settings()
    api_key_obj = None
    if settings.current_key:
        for key_obj in settings.keys:
            if key_obj.id == settings.current_key and key_obj.active:
                api_key_obj = key_obj
                break
    
    if not api_key_obj:
        raise HTTPException(status_code=400, detail="Немає активного API ключа")
    
    try:
        client = GPTClient(api_key_obj.key)
        categories = client.parse_competitor_categories(competitor_data["url"])
        
        # Оновлюємо категорії конкурента
        competitor_data["categories"] = categories
        competitor_data["last_parsed"] = datetime.now().isoformat()
        
        await save_competitors(competitors_db)
        
        return {"success": True, "categories": categories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/competitors/{competitor_id}/add_category")
async def add_category_manually(competitor_id: str, request: dict):
    """Додати категорію вручну"""
    from .gpt_client import GPTClient
    from urllib.parse import urlparse
    import hashlib
    
    competitors_db = await load_competitors()
    
    competitor_data = None
    for c in competitors_db["competitors"]:
        if c["id"] == competitor_id:
            competitor_data = c
            break
    
    if not competitor_data:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    url = request.get("url", "").strip()
    name = request.get("name", "").strip()
    
    if not url:
        raise HTTPException(status_code=400, detail="URL категорії обов'язковий")
    if not name:
        raise HTTPException(status_code=400, detail="Назва категорії обов'язкова")
    
    # Валідація URL
    try:
        parsed_url = urlparse(url)
        if not parsed_url.scheme or not parsed_url.netloc:
            raise HTTPException(status_code=400, detail="Невірний формат URL")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Невірний URL: {str(e)}")
    
    # Перевірка домену URL - чи він належить поточному конкуренту
    competitor_url = competitor_data.get("url", "").strip()
    if competitor_url:
        try:
            competitor_parsed = urlparse(competitor_url)
            category_parsed = urlparse(url)
            
            # Нормалізуємо домени (видаляємо www)
            competitor_domain = competitor_parsed.netloc.lower().replace("www.", "")
            category_domain = category_parsed.netloc.lower().replace("www.", "")
            
            if competitor_domain != category_domain:
                raise HTTPException(
                    status_code=400, 
                    detail=f"URL категорії належить іншому постачальнику. Домен конкурента: {competitor_parsed.netloc}, домен категорії: {category_parsed.netloc}"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Помилка перевірки домену: {str(e)}")
            # Якщо помилка перевірки, продовжуємо (не блокуємо додавання)
    
    # Генеруємо ID на основі URL
    parsed = urlparse(url)
    path = parsed.path.strip("/").replace("/", "-")
    if path:
        category_id = path
    else:
        # Якщо немає шляху, генеруємо на основі URL
        category_id = hashlib.md5(url.encode()).hexdigest()[:12]
    
    # Перевіряємо, чи категорія з таким ID або URL вже існує
    def category_exists(categories, cat_id=None, cat_url=None):
        """Рекурсивно перевіряє існування категорії по ID або URL"""
        for cat in categories:
            # Перевірка по ID
            if cat_id and cat.get("id") == cat_id:
                return True, "ID"
            # Перевірка по URL
            if cat_url and cat.get("url") and cat.get("url").strip() == cat_url.strip():
                return True, "URL"
            if cat.get("children"):
                exists, reason = category_exists(cat["children"], cat_id, cat_url)
                if exists:
                    return True, reason
        return False, None
    
    exists, reason = category_exists(competitor_data.get("categories", []), category_id, url)
    if exists:
        if reason == "URL":
            raise HTTPException(status_code=400, detail="Категорія з таким URL вже існує")
        else:
            raise HTTPException(status_code=400, detail="Категорія з таким ID вже існує")
    
    # Створюємо нову категорію
    new_category = {
        "id": category_id,
        "name": name,
        "url": url,
        "children": [],
        "manual_added": True  # Позначаємо, що додано вручну
    }
    
    # Додаємо категорію до списку
    if "categories" not in competitor_data:
        competitor_data["categories"] = []
    competitor_data["categories"].append(new_category)
    
    await save_competitors(competitors_db)
    
    # Якщо є активний API ключ, спробуємо автоматично оновити назву через GPT
    try:
        settings = await load_settings()
        api_key_obj = None
        if settings.current_key:
            for key_obj in settings.keys:
                if key_obj.id == settings.current_key and key_obj.active:
                    api_key_obj = key_obj
                    break
        
        if api_key_obj:
            client = GPTClient(api_key_obj.key)
            # Парсимо назву категорії з URL
            parsed_name = client.parse_category_name(url)
            
            # Оновлюємо назву категорії
            def update_category_name(categories, cat_id, new_name):
                """Рекурсивно оновлює назву категорії"""
                for cat in categories:
                    if cat.get("id") == cat_id:
                        cat["name"] = new_name
                        return True
                    if cat.get("children"):
                        if update_category_name(cat["children"], cat_id, new_name):
                            return True
                return False
            
            update_category_name(competitor_data["categories"], category_id, parsed_name)
            await save_competitors(competitors_db)
            
            return {
                "success": True,
                "category": new_category,
                "name_updated": True,
                "parsed_name": parsed_name
            }
    except Exception as e:
        logger.warning(f"Не вдалося автоматично оновити назву категорії: {str(e)}")
        # Продовжуємо навіть якщо не вдалося оновити назву
    
    return {
        "success": True,
        "category": new_category,
        "name_updated": False
    }


@app.post("/competitors/{competitor_id}/delete_categories")
async def delete_categories(competitor_id: str, request: dict):
    """Видалити вибрані категорії"""
    competitors_db = await load_competitors()
    
    competitor_data = None
    for c in competitors_db["competitors"]:
        if c["id"] == competitor_id:
            competitor_data = c
            break
    
    if not competitor_data:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    category_ids = request.get("category_ids", [])
    
    if not category_ids or len(category_ids) == 0:
        raise HTTPException(status_code=400, detail="Список ID категорій обов'язковий")
    
    def delete_categories_recursive(categories, ids_to_delete):
        """Рекурсивно видаляє категорії за ID"""
        result = []
        deleted_count = 0
        
        for cat in categories:
            if cat.get("id") in ids_to_delete:
                deleted_count += 1
                # Не додаємо категорію до результату (видаляємо)
                continue
            
            # Обробляємо дочірні категорії рекурсивно
            if cat.get("children"):
                filtered_children, children_deleted = delete_categories_recursive(cat["children"], ids_to_delete)
                deleted_count += children_deleted
                cat["children"] = filtered_children
            
            result.append(cat)
        
        return result, deleted_count
    
    filtered_categories, deleted_count = delete_categories_recursive(
        competitor_data.get("categories", []), 
        category_ids
    )
    
    competitor_data["categories"] = filtered_categories
    
    await save_competitors(competitors_db)
    
    return {
        "success": True,
        "deleted_count": deleted_count
    }


@app.get("/competitor/{competitor_id}", response_class=HTMLResponse)
async def competitor_detail_page(competitor_id: str):
    """Сторінка детального перегляду конкурента"""
    with open("app/templates/competitor.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.get("/competitors/{competitor_id}/category/{category_id}", response_class=HTMLResponse)
async def category_page(competitor_id: str, category_id: str):
    """Сторінка категорії конкурента"""
    with open("app/templates/category.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.get("/competitors/{competitor_id}/category/{category_id}/data")
async def get_category_data(competitor_id: str, category_id: str):
    """Отримати дані категорії"""
    competitors_db = await load_competitors()
    
    competitor_data = None
    for c in competitors_db["competitors"]:
        if c["id"] == competitor_id:
            competitor_data = c
            break
    
    if not competitor_data:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    def find_category(categories, cat_id):
        """Рекурсивний пошук категорії"""
        for cat in categories:
            if cat["id"] == cat_id:
                return cat, []
            if "children" in cat and cat["children"]:
                found, path = find_category(cat["children"], cat_id)
                if found:
                    return found, [cat] + path
        return None, []
    
    category, path = find_category(competitor_data.get("categories", []), category_id)
    
    if not category:
        raise HTTPException(status_code=404, detail="Категорія не знайдено")
    
    # Формуємо breadcrumb
    breadcrumb = [{"name": competitor_data["name"], "url": f"/competitor/{competitor_id}"}]
    for p in reversed(path):
        breadcrumb.append({"name": p["name"], "url": f"/competitors/{competitor_id}/category/{p['id']}"})
    breadcrumb.append({"name": category["name"], "url": f"/competitors/{competitor_id}/category/{category_id}"})
    
    # Підраховуємо підкатегорії
    def count_subcategories(cats):
        count = len(cats)
        for cat in cats:
            if "children" in cat and cat["children"]:
                count += count_subcategories(cat["children"])
        return count
    
    subcategories_count = count_subcategories(category.get("children", []))
    
    return {
        "category": category,
        "competitor": {
            "id": competitor_data["id"],
            "name": competitor_data["name"]
        },
        "breadcrumb": breadcrumb,
        "subcategories_count": subcategories_count
    }


# ========== API ENDPOINTS ДЛЯ ФОНОВИХ ЗАДАЧ ==========

@app.post("/tasks/parse_products")
async def create_parse_all_task(background_tasks: BackgroundTasks):
    """Створити задачу на парсинг всіх товарів"""
    try:
        task_id = str(uuid.uuid4())
        
        # Ініціалізуємо прогрес
        progress = await load_progress()
        progress["tasks"][task_id] = {
            "type": "parse_products",
            "total": 0,
            "done": 0,
            "errors": [],
            "status": "running"
        }
        await save_progress(progress)
        
        # Запускаємо фонову задачу
        asyncio.create_task(parse_all_products(task_id))
        
        return {"task_id": task_id}
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Помилка створення задачі: {str(e)}\n{error_details}")


@app.post("/tasks/parse_product/{product_id}")
async def create_parse_product_task(product_id: str, background_tasks: BackgroundTasks):
    """Створити задачу на парсинг одного товару"""
    task_id = str(uuid.uuid4())
    
    # Перевіряємо, чи товар існує
    db = await load_db()
    product_exists = any(p["id"] == product_id for p in db["products"])
    if not product_exists:
        raise HTTPException(status_code=404, detail="Товар не знайдено")
    
    # Ініціалізуємо прогрес
    progress = await load_progress()
    progress["tasks"][task_id] = {
        "type": "parse_product",
        "total": 1,
        "done": 0,
        "errors": [],
        "status": "running"
    }
    await save_progress(progress)
    
    # Запускаємо фонову задачу
    asyncio.create_task(parse_single_product(task_id, product_id))
    
    return {"task_id": task_id}


@app.post("/tasks/parse_categories/{competitor_id}")
async def create_parse_categories_task(competitor_id: str, background_tasks: BackgroundTasks):
    """Створити задачу на парсинг категорій конкурента"""
    task_id = str(uuid.uuid4())
    
    # Перевіряємо, чи конкурент існує
    competitors_db = await load_competitors()
    competitor_exists = any(c["id"] == competitor_id for c in competitors_db["competitors"])
    if not competitor_exists:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    # Ініціалізуємо прогрес
    progress = await load_progress()
    progress["tasks"][task_id] = {
        "type": "parse_categories",
        "total": 1,
        "done": 0,
        "errors": [],
        "status": "running"
    }
    await save_progress(progress)
    
    # Запускаємо фонову задачу
    asyncio.create_task(parse_competitor_categories(task_id, competitor_id))
    
    return {"task_id": task_id}


@app.post("/tasks/update_categories/{competitor_id}")
async def create_update_categories_task(competitor_id: str, background_tasks: BackgroundTasks):
    """Створити задачу на оновлення категорій конкурента з порівнянням"""
    task_id = str(uuid.uuid4())
    
    # Перевіряємо, чи конкурент існує
    competitors_db = await load_competitors()
    competitor_exists = any(c["id"] == competitor_id for c in competitors_db["competitors"])
    if not competitor_exists:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    # Ініціалізуємо прогрес
    progress = await load_progress()
    progress["tasks"][task_id] = {
        "type": "update_categories",
        "total": 1,
        "done": 0,
        "errors": [],
        "status": "running"
    }
    await save_progress(progress)
    
    # Запускаємо фонову задачу
    asyncio.create_task(update_competitor_categories(task_id, competitor_id))
    
    return {"task_id": task_id}


@app.post("/tasks/discover_products")
async def create_discover_products_task(request: DiscoverProductsRequest, background_tasks: BackgroundTasks):
    """Створити задачу на пошук товарів у вибраних категоріях"""
    competitor_id = request.competitor_id
    category_ids = request.category_ids
    
    if not competitor_id:
        raise HTTPException(status_code=400, detail="competitor_id обов'язковий")
    if not category_ids or len(category_ids) == 0:
        raise HTTPException(status_code=400, detail="category_ids обов'язковий та не може бути порожнім")
    
    # Перевіряємо, чи конкурент існує
    competitors_db = await load_competitors()
    competitor_exists = any(c["id"] == competitor_id for c in competitors_db["competitors"])
    if not competitor_exists:
        raise HTTPException(status_code=404, detail="Конкурент не знайдено")
    
    task_id = str(uuid.uuid4())
    
    # Ініціалізуємо прогрес
    progress = await load_progress()
    progress["tasks"][task_id] = {
        "type": "discover_products",
        "total": len(category_ids),
        "done": 0,
        "errors": [],
        "status": "running"
    }
    await save_progress(progress)
    
    # Запускаємо фонову задачу
    try:
        asyncio.create_task(discover_products(task_id, competitor_id, category_ids))
        print(f"Запущено фонову задачу discover_products: task_id={task_id}")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Помилка запуску задачі discover_products: {e}\n{error_details}")
        # Оновлюємо статус на failed
        progress = await load_progress()
        if task_id in progress["tasks"]:
            progress["tasks"][task_id]["status"] = "failed"
            progress["tasks"][task_id]["errors"] = [f"Помилка запуску: {str(e)}"]
            await save_progress(progress)
        raise
    
    return {"task_id": task_id}


@app.post("/tasks/parse_filtered")
async def create_parse_filtered_task(filters: dict, background_tasks: BackgroundTasks):
    """Створити задачу на парсинг відфільтрованих товарів"""
    try:
        task_id = str(uuid.uuid4())
        
        # Ініціалізуємо прогрес
        progress = await load_progress()
        progress["tasks"][task_id] = {
            "type": "parse_filtered",
            "total": 0,
            "done": 0,
            "errors": [],
            "status": "running"
        }
        await save_progress(progress)
        
        # Запускаємо фонову задачу
        asyncio.create_task(parse_filtered_products(task_id, filters))
        
        return {"task_id": task_id}
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Помилка створення задачі: {str(e)}\n{error_details}")


@app.post("/tasks/parse_selected")
async def create_parse_selected_task(request: dict, background_tasks: BackgroundTasks):
    """Створити задачу на парсинг вибраних товарів"""
    try:
        product_ids = request.get("ids", [])
        
        if not product_ids or len(product_ids) == 0:
            raise HTTPException(status_code=400, detail="Список ID товарів не може бути порожнім")
        
        task_id = str(uuid.uuid4())
        
        # Перевіряємо, чи всі товари існують
        db = await load_db()
        existing_ids = {p["id"] for p in db["products"]}
        missing_ids = [pid for pid in product_ids if pid not in existing_ids]
        
        if missing_ids:
            raise HTTPException(status_code=404, detail=f"Товари не знайдено: {', '.join(missing_ids[:5])}")
        
        # Ініціалізуємо прогрес
        progress = await load_progress()
        progress["tasks"][task_id] = {
            "type": "parse_selected",
            "total": len(product_ids),
            "done": 0,
            "errors": [],
            "status": "running"
        }
        await save_progress(progress)
        
        # Запускаємо фонову задачу
        asyncio.create_task(parse_selected_products(task_id, product_ids))
        
        return {"task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Помилка створення задачі: {str(e)}\n{error_details}")


@app.get("/tasks/status/{task_id}")
async def get_task_status_endpoint(task_id: str):
    """Отримати статус задачі"""
    task = await get_task_status(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Задача не знайдено")
    
    result = {
        "total": task.get("total", 0),
        "done": task.get("done", 0),
        "errors": task.get("errors", []),
        "status": task.get("status", "unknown")
    }
    
    # Додаємо додаткову інформацію для discover_products
    if task.get("type") == "discover_products":
        result["products_found"] = task.get("products_found", 0)
    
    return result


@app.get("/tasks/errors/{task_id}")
async def get_task_errors(task_id: str):
    """Отримати список помилок задачі"""
    task = await get_task_status(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Задача не знайдено")
    
    return {
        "errors": task.get("errors", [])
    }


# ========== API ENDPOINTS ДЛЯ ХАРАКТЕРИСТИК ==========

@app.get("/characteristics/groups")
async def list_characteristic_groups():
    """Отримати список груп характеристик"""
    characteristics_db = await load_characteristics()
    return {"groups": characteristics_db.get("groups", [])}


@app.post("/characteristics/groups")
async def add_characteristic_group(group_data: CharacteristicGroupAdd):
    """Додати нову групу характеристик"""
    characteristics_db = await load_characteristics()
    
    new_group = {
        "id": str(uuid.uuid4()),
        "name": group_data.name,
        "description": group_data.description or "",
        "priority": group_data.priority or 2,
        "category_path": group_data.category_path or [],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    
    characteristics_db.setdefault("groups", []).append(new_group)
    await save_characteristics(characteristics_db)
    
    return {"success": True, "group": new_group}


@app.put("/characteristics/groups/{group_id}")
async def update_characteristic_group(group_id: str, group_data: CharacteristicGroupAdd):
    """Оновити групу характеристик"""
    characteristics_db = await load_characteristics()
    groups = characteristics_db.get("groups", [])
    
    group_index = None
    for i, g in enumerate(groups):
        if g["id"] == group_id:
            group_index = i
            break
    
    if group_index is None:
        raise HTTPException(status_code=404, detail="Групу не знайдено")
    
    groups[group_index].update({
        "name": group_data.name,
        "description": group_data.description or "",
        "priority": group_data.priority or 2,
        "category_path": group_data.category_path or [],
        "updated_at": datetime.now().isoformat()
    })
    
    await save_characteristics(characteristics_db)
    return {"success": True, "group": groups[group_index]}


@app.delete("/characteristics/groups/{group_id}")
async def delete_characteristic_group(group_id: str):
    """Видалити групу характеристик"""
    characteristics_db = await load_characteristics()
    
    # Знаходимо групу, яку видаляємо, щоб отримати її категорії
    groups = characteristics_db.get("groups", [])
    deleted_group = None
    for g in groups:
        if g["id"] == group_id:
            deleted_group = g
            break
    
    # Видаляємо групу
    characteristics_db["groups"] = [g for g in groups if g["id"] != group_id]
    
    # Оновлюємо характеристики: видаляємо group_id та присвоюємо категорії групи
    characteristics = characteristics_db.get("characteristics", [])
    if deleted_group:
        group_categories = deleted_group.get("category_path", [])
        for char in characteristics:
            if char.get("group_id") == group_id:
                char["group_id"] = None
                # Якщо у характеристики немає категорій, присвоюємо категорії групи
                if not char.get("category_path"):
                    char["category_path"] = group_categories.copy()
                # Якщо є категорії, об'єднуємо (без дублікатів)
                else:
                    existing_categories = set(char.get("category_path", []))
                    for cat in group_categories:
                        if cat not in existing_categories:
                            char["category_path"].append(cat)
    else:
        # Якщо групу не знайдено, просто видаляємо group_id
        for char in characteristics:
            if char.get("group_id") == group_id:
                char["group_id"] = None
    
    await save_characteristics(characteristics_db)
    return {"success": True}


@app.get("/characteristics")
async def list_characteristics(
    name: Optional[str] = None,
    category_path: Optional[List[str]] = Query(None),
    group_id: Optional[str] = None
):
    """Отримати список характеристик з фільтрами"""
    characteristics_db = await load_characteristics()
    characteristics = characteristics_db.get("characteristics", [])
    
    # Фільтрація
    if name:
        characteristics = [c for c in characteristics if name.lower() in c.get("name", "").lower()]
    
    if category_path:
        filtered = []
        for char in characteristics:
            char_categories = char.get("category_path", [])
            if not char_categories or any(cat in category_path for cat in char_categories):
                filtered.append(char)
        characteristics = filtered
    
    if group_id:
        characteristics = [c for c in characteristics if c.get("group_id") == group_id]
    
    return {"characteristics": characteristics}


@app.get("/characteristics/page", response_class=HTMLResponse)
async def characteristics_page():
    """Сторінка характеристик"""
    with open("app/templates/characteristics.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.post("/characteristics")
async def add_characteristic(char_data: CharacteristicAdd):
    """Додати нову характеристику"""
    characteristics_db = await load_characteristics()
    
    new_char = {
        "id": str(uuid.uuid4()),
        "name": char_data.name,
        "type": char_data.type,
        "priority": char_data.priority,
        "unit": char_data.unit,
        "category_path": char_data.category_path or [],
        "group_id": char_data.group_id,
        "photo_url": char_data.photo_url,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    
    characteristics_db.setdefault("characteristics", []).append(new_char)
    await save_characteristics(characteristics_db)
    
    return {"success": True, "characteristic": new_char}


@app.put("/characteristics/{char_id}")
async def update_characteristic(char_id: str, char_data: CharacteristicAdd):
    """Оновити характеристику"""
    characteristics_db = await load_characteristics()
    characteristics = characteristics_db.get("characteristics", [])
    
    char_index = None
    for i, c in enumerate(characteristics):
        if c["id"] == char_id:
            char_index = i
            break
    
    if char_index is None:
        raise HTTPException(status_code=404, detail="Характеристику не знайдено")
    
    characteristics[char_index].update({
        "name": char_data.name,
        "type": char_data.type,
        "priority": char_data.priority,
        "unit": char_data.unit,
        "category_path": char_data.category_path or [],
        "group_id": char_data.group_id,
        "photo_url": char_data.photo_url,
        "choices": char_data.choices or [],
        "updated_at": datetime.now().isoformat()
    })
    
    await save_characteristics(characteristics_db)
    return {"success": True, "characteristic": characteristics[char_index]}


@app.delete("/characteristics/{char_id}")
async def delete_characteristic(char_id: str):
    """Видалити характеристику"""
    characteristics_db = await load_characteristics()
    
    # Видаляємо характеристику
    characteristics = characteristics_db.get("characteristics", [])
    characteristics_db["characteristics"] = [c for c in characteristics if c["id"] != char_id]
    
    # Видаляємо значення характеристик з товарів
    product_characteristics = characteristics_db.get("product_characteristics", {})
    for product_id, char_values in product_characteristics.items():
        characteristics_db["product_characteristics"][product_id] = [
            cv for cv in char_values if cv.get("characteristic_id") != char_id
        ]
    
    await save_characteristics(characteristics_db)
    return {"success": True}


@app.get("/products/{product_id}/characteristics")
async def get_product_characteristics(product_id: str):
    """Отримати характеристики для товару"""
    db = await load_db()
    product = None
    for p in db.get("products", []):
        if p["id"] == product_id:
            product = p
            break
    
    if not product:
        raise HTTPException(status_code=404, detail="Товар не знайдено")
    
    category_path = product.get("category_path", [])
    logger.info(f"Завантаження характеристик для товару {product_id}, категорії: {category_path}")
    # Передаємо category_path як список, якщо він є
    characteristics = await get_characteristics_for_product(product_id, category_path if category_path else None)
    logger.info(f"Отримано {len(characteristics)} характеристик для товару")
    values = await get_product_characteristic_values(product_id)
    
    # Додаємо значення до кожної характеристики
    for char in characteristics:
        char_id = char["id"]
        if char_id in values:
            char["value"] = values[char_id].get("value")
            char["photo_url"] = values[char_id].get("photo_url")
        else:
            char["value"] = None
            char["photo_url"] = None
    
    return {"characteristics": characteristics}


@app.post("/products/{product_id}/characteristics")
async def add_product_characteristic_value(product_id: str, value_data: CharacteristicValueAdd):
    """Додати значення характеристики до товару"""
    characteristics_db = await load_characteristics()
    
    # Перевіряємо, чи існує характеристика
    characteristics = characteristics_db.get("characteristics", [])
    char_exists = any(c["id"] == value_data.characteristic_id for c in characteristics)
    if not char_exists:
        raise HTTPException(status_code=404, detail="Характеристику не знайдено")
    
    # Додаємо або оновлюємо значення
    product_characteristics = characteristics_db.setdefault("product_characteristics", {})
    char_values = product_characteristics.setdefault(product_id, [])
    
    # Шукаємо існуюче значення
    value_index = None
    for i, cv in enumerate(char_values):
        if cv.get("characteristic_id") == value_data.characteristic_id:
            value_index = i
            break
    
    new_value = {
        "characteristic_id": value_data.characteristic_id,
        "value": value_data.value,
        "photo_url": value_data.photo_url
    }
    
    if value_index is not None:
        char_values[value_index] = new_value
    else:
        char_values.append(new_value)
    
    await save_characteristics(characteristics_db)
    return {"success": True, "value": new_value}


@app.delete("/products/{product_id}/characteristics/{char_id}")
async def delete_product_characteristic_value(product_id: str, char_id: str):
    """Видалити значення характеристики з товару"""
    characteristics_db = await load_characteristics()
    product_characteristics = characteristics_db.get("product_characteristics", {})
    
    if product_id in product_characteristics:
        char_values = product_characteristics[product_id]
        product_characteristics[product_id] = [
            cv for cv in char_values if cv.get("characteristic_id") != char_id
        ]
        await save_characteristics(characteristics_db)
    
    return {"success": True}


@app.delete("/products/{product_id}/characteristics/clear-choices")
async def clear_product_characteristic_choices(product_id: str):
    """Очистити всі значення характеристик типу choice та variation для товару"""
    characteristics_db = await load_characteristics()
    product_characteristics = characteristics_db.get("product_characteristics", {})
    
    if product_id not in product_characteristics:
        return {"success": True, "cleared": 0}
    
    # Отримуємо всі характеристики
    all_characteristics = characteristics_db.get("characteristics", [])
    
    # Знаходимо ID характеристик типу choice та variation
    choice_char_ids = set()
    for char in all_characteristics:
        if char.get("type") in ["choice", "variation"]:
            choice_char_ids.add(char["id"])
    
    # Видаляємо значення для цих характеристик
    char_values = product_characteristics[product_id]
    original_count = len(char_values)
    product_characteristics[product_id] = [
        cv for cv in char_values if cv.get("characteristic_id") not in choice_char_ids
    ]
    cleared_count = original_count - len(product_characteristics[product_id])
    
    await save_characteristics(characteristics_db)
    
    return {"success": True, "cleared": cleared_count}
