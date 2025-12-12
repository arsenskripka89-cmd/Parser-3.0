import json
import time
import logging
import re
from typing import Dict, Optional
from openai import OpenAI
import httpx
from bs4 import BeautifulSoup

# Налаштування логування
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ProductNotFoundError(Exception):
    """Виняток для випадку, коли товар не знайдено на сайті (404)"""
    pass


class GPTClient:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key, timeout=120.0)  # Збільшено до 120 секунд
        self.max_retries = 3

    def _fetch_page_content(self, url: str, timeout: float = 30.0, max_retries: int = 3) -> str:
        """Отримує контент сторінки через HTTP запит з retry логікою"""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        last_error = None
        for attempt in range(max_retries):
            try:
                # Збільшуємо таймаут з кожною спробою
                current_timeout = timeout * (1 + attempt * 0.5)  # 30s, 45s, 60s для 3 спроб
                logger.info(f"Спроба {attempt + 1}/{max_retries} отримання сторінки {url} (таймаут: {current_timeout}s)")
                
                with httpx.Client(timeout=current_timeout, headers=headers) as client:
                    response = client.get(url, follow_redirects=True)
                    response.raise_for_status()
                    content = response.text
                    logger.info(f"Отримано HTML контент: {len(content)} символів")
                    return content
            except httpx.TimeoutException as e:
                last_error = e
                logger.warning(f"Таймаут запиту до {url} (спроба {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    logger.info(f"Очікування {wait_time} секунд перед наступною спробою...")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"Таймаут запиту до {url} після {max_retries} спроб. Спробуйте ще раз або перевірте інтернет-з'єднання.")
            except httpx.HTTPStatusError as e:
                # Спеціальна обробка для 404 - товар більше не існує
                if e.response.status_code == 404:
                    raise ProductNotFoundError(f"Товар не знайдено на сайті (404): {url}")
                raise Exception(f"Помилка HTTP {e.response.status_code} при отриманні сторінки {url}: {str(e)}")
            except httpx.RequestError as e:
                last_error = e
                logger.warning(f"Помилка запиту до {url} (спроба {attempt + 1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.info(f"Очікування {wait_time} секунд перед наступною спробою...")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"Помилка отримання сторінки {url} після {max_retries} спроб: {str(e)}")
            except Exception as e:
                last_error = e
                logger.warning(f"Невідома помилка при отриманні сторінки {url} (спроба {attempt + 1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.info(f"Очікування {wait_time} секунд перед наступною спробою...")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"Помилка отримання сторінки {url}: {str(e)}")
        
        # Якщо дійшли сюди, всі спроби не вдалися
        raise Exception(f"Не вдалося отримати сторінку {url} після {max_retries} спроб. Остання помилка: {str(last_error)}")
    
    def _optimize_html(self, html_content: str) -> str:
        """Оптимізує HTML контент для швидшого парсингу"""
        try:
            # Видаляємо скрипти та стилі (вони не потрібні для парсингу)
            html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            
            # Видаляємо коментарі
            html_content = re.sub(r'<!--.*?-->', '', html_content, flags=re.DOTALL)
            
            # Видаляємо зайві пробіли та переноси рядків
            html_content = re.sub(r'\s+', ' ', html_content)
            
            # Зберігаємо JSON-LD дані окремо (вони важливі)
            json_ld_pattern = r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
            json_ld_matches = re.findall(json_ld_pattern, html_content, re.DOTALL | re.IGNORECASE)
            
            # Обмежуємо розмір HTML до 25000 символів (оптимально для GPT)
            optimized = html_content[:25000]
            
            # Якщо є JSON-LD дані, додаємо їх в кінець
            if json_ld_matches:
                json_ld_text = '\n\nJSON-LD дані:\n' + '\n'.join(json_ld_matches[:2])  # Беремо перші 2
                # Переконуємося, що загальний розмір не перевищує 30000
                if len(optimized) + len(json_ld_text) > 30000:
                    optimized = optimized[:30000 - len(json_ld_text)]
                optimized += json_ld_text
            
            logger.info(f"Оптимізовано HTML: {len(html_content)} → {len(optimized)} символів")
            return optimized
        except Exception as e:
            logger.warning(f"Помилка оптимізації HTML: {e}, використовуємо оригінал")
            return html_content[:30000]  # Якщо помилка, просто обрізаємо
    
    def _optimize_html_for_categories(self, html_content: str) -> str:
        """Оптимізує HTML контент спеціально для парсингу категорій (зберігає важливі частини)"""
        try:
            # Використовуємо BeautifulSoup для кращої обробки
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Видаляємо скрипти та стилі
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Збираємо важливі частини:
            important_parts = []
            
            # 1. Header та навігація
            header = soup.find('header')
            if header:
                important_parts.append(f"<!-- HEADER -->\n{str(header)}")
            
            nav_elements = soup.find_all('nav')
            for nav in nav_elements:
                important_parts.append(f"<!-- NAV -->\n{str(nav)}")
            
            # 2. Елементи з класами меню
            menu_classes = ['menu', 'nav', 'navigation', 'main-menu', 'header-menu', 'top-menu', 
                           'site-nav', 'primary-nav', 'navbar', 'catalog-menu', 'category-menu']
            for class_name in menu_classes:
                elements = soup.find_all(class_=re.compile(class_name, re.I))
                for elem in elements:
                    important_parts.append(f"<!-- MENU {class_name} -->\n{str(elem)}")
            
            # 3. Footer
            footer = soup.find('footer')
            if footer:
                important_parts.append(f"<!-- FOOTER -->\n{str(footer)}")
            
            # 4. Sidebar
            sidebar = soup.find(class_=re.compile('sidebar', re.I))
            if sidebar:
                important_parts.append(f"<!-- SIDEBAR -->\n{str(sidebar)}")
            
            # 5. Всі посилання (a теги) - важливо для категорій
            all_links = soup.find_all('a', href=True)
            links_html = "\n".join([str(link) for link in all_links[:200]])  # Перші 200 посилань
            if links_html:
                important_parts.append(f"<!-- ALL LINKS -->\n{links_html}")
            
            # 6. Список (ul/li) елементів - часто містять категорії
            list_elements = soup.find_all(['ul', 'ol'])
            lists_html = "\n".join([str(ul) for ul in list_elements[:50]])  # Перші 50 списків
            if lists_html:
                important_parts.append(f"<!-- LISTS -->\n{lists_html}")
            
            # Об'єднуємо всі важливі частини
            combined = "\n\n".join(important_parts)
            
            # Якщо важливих частин недостатньо, додаємо початок документа
            if len(combined) < 20000:
                body = soup.find('body')
                if body:
                    body_text = str(body)[:30000]
                    combined = combined + "\n\n<!-- ADDITIONAL CONTENT -->\n" + body_text
            
            # Видаляємо зайві пробіли
            combined = re.sub(r'\s+', ' ', combined)
            
            # Обмежуємо до 60000 символів для GPT
            optimized = combined[:60000]
            
            logger.info(f"Оптимізовано HTML для категорій: {len(html_content)} → {len(optimized)} символів (важливі частини)")
            return optimized
        except Exception as e:
            logger.warning(f"Помилка оптимізації HTML для категорій: {e}, використовуємо спрощений метод")
            # Fallback до простого методу
            html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            html_content = re.sub(r'<!--.*?-->', '', html_content, flags=re.DOTALL)
            html_content = re.sub(r'\s+', ' ', html_content)
            return html_content[:60000]
    
    def _optimize_html_for_products(self, html_content: str) -> str:
        """Оптимізує HTML контент спеціально для парсингу товарів (зберігає важливі частини)"""
        try:
            # Використовуємо BeautifulSoup для кращої обробки
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Видаляємо скрипти та стилі (але зберігаємо JSON-LD)
            for script in soup(["script", "style"]):
                # Не видаляємо JSON-LD скрипти
                if script.get('type') and 'json' in script.get('type', '').lower():
                    continue
                script.decompose()
            
            # Збираємо важливі частини для товарів:
            important_parts = []
            
            # 1. Елементи з класами товарів (збільшуємо ліміт)
            product_classes = ['product', 'products', 'product-list', 'product-grid', 'product-item', 
                            'product-card', 'product-box', 'item-card', 'catalog-item', 'goods-item',
                            'product-tile', 'product-wrapper', 'product-container', 'grid-item', 
                            'list-item', 'items', 'catalog-items', 'goods-list', 'items-list',
                            'ty-grid-list', 'ty-product-list', 'ty-product-item', 'ty-product-block']
            for class_name in product_classes:
                elements = soup.find_all(class_=re.compile(class_name, re.I))
                # Збільшуємо ліміт до 200 елементів
                for elem in elements[:200]:
                    important_parts.append(f"<!-- PRODUCT {class_name} -->\n{str(elem)}")
            
            # 2. Каруселі та слайдери
            carousel_classes = ['carousel', 'slider', 'swiper', 'products-carousel', 'featured-products',
                              'popular-products', 'recommended', 'new-products', 'sale-products']
            for class_name in carousel_classes:
                elements = soup.find_all(class_=re.compile(class_name, re.I))
                for elem in elements[:100]:  # Збільшуємо до 100
                    important_parts.append(f"<!-- CAROUSEL {class_name} -->\n{str(elem)}")
            
            # 3. Всі посилання (a теги) - можуть бути товарами (збільшуємо ліміт)
            all_links = soup.find_all('a', href=True)
            # Фільтруємо посилання, які можуть бути товарами
            product_links = []
            for link in all_links:
                href = link.get('href', '')
                text = link.get_text(strip=True)
                # Пропускаємо посилання на категорії, соцмережі, тощо
                if (href and 
                    not href.startswith('#') and 
                    not href.startswith('javascript:') and
                    not 'category' in href.lower() and
                    not 'catalog' in href.lower() and
                    not 'page=' in href.lower() and  # Пропускаємо посилання на пагінацію
                    len(text) > 3 and  # Зменшуємо мінімальну довжину тексту
                    not any(social in href.lower() for social in ['facebook', 'twitter', 'instagram', 'youtube', 'vk', 'telegram'])):
                    product_links.append(str(link))
            if product_links:
                # Збільшуємо ліміт до 500 посилань
                important_parts.append(f"<!-- PRODUCT LINKS ({len(product_links)} total) -->\n" + "\n".join(product_links[:500]))
            
            # 4. JSON-LD структуровані дані (можуть містити товари) - ВАЖЛИВО!
            json_ld_scripts = soup.find_all('script', type=re.compile('application/ld\+json', re.I))
            for script in json_ld_scripts[:10]:  # Збільшуємо до 10
                script_text = script.string
                if script_text:
                    important_parts.append(f"<!-- JSON-LD -->\n{script_text}")
            
            # 5. Елементи з data-атрибутами товарів
            data_product_elements = soup.find_all(attrs={'data-product-id': True})
            data_product_elements.extend(soup.find_all(attrs={'data-product-url': True}))
            data_product_elements.extend(soup.find_all(attrs={'data-item-id': True}))
            data_product_elements.extend(soup.find_all(attrs={'data-id': True}))  # Додаємо загальний data-id
            if data_product_elements:
                important_parts.append(f"<!-- DATA-PRODUCT ELEMENTS ({len(data_product_elements)} total) -->\n" + 
                                     "\n".join([str(elem) for elem in data_product_elements[:200]]))  # Збільшуємо до 200
            
            # 6. Всі div, article, li елементи, що містять посилання (можуть бути товарами)
            containers_with_links = []
            for tag in ['div', 'article', 'li', 'section']:
                elements = soup.find_all(tag)
                for elem in elements:
                    # Перевіряємо, чи містить посилання та текст
                    link = elem.find('a', href=True)
                    text = elem.get_text(strip=True)
                    href = link.get('href', '') if link else ''
                    # Фільтруємо: має бути посилання, текст, не категорія, не пагінація
                    if (link and 
                        href and 
                        not href.startswith('#') and
                        not href.startswith('javascript:') and
                        'category' not in href.lower() and
                        'catalog' not in href.lower() and
                        'page=' not in href.lower() and
                        len(text) > 5 and len(text) < 300):  # Збільшуємо максимальну довжину
                        containers_with_links.append(str(elem))
                        if len(containers_with_links) >= 500:  # Збільшуємо ліміт до 500
                            break
                if len(containers_with_links) >= 500:
                    break
            if containers_with_links:
                important_parts.append(f"<!-- CONTAINERS WITH LINKS ({len(containers_with_links)} total) -->\n" + 
                                     "\n".join(containers_with_links))
            
            # 7. Основна частина сторінки (body) - якщо важливих частин недостатньо
            combined = "\n\n".join(important_parts)
            if len(combined) < 50000:  # Збільшуємо поріг
                body = soup.find('body')
                if body:
                    # Беремо основну частину body (може містити товари)
                    body_text = str(body)[:80000]  # Збільшуємо до 80000
                    combined = combined + "\n\n<!-- MAIN CONTENT -->\n" + body_text
            
            # Видаляємо зайві пробіли
            combined = re.sub(r'\s+', ' ', combined)
            
            # Збільшуємо ліміт до 100000 символів для GPT (gpt-4o-mini підтримує більше)
            optimized = combined[:100000]
            
            logger.info(f"Оптимізовано HTML для товарів: {len(html_content)} → {len(optimized)} символів (важливі частини)")
            logger.info(f"Знайдено важливих частин: {len(important_parts)} блоків")
            return optimized
        except Exception as e:
            logger.warning(f"Помилка оптимізації HTML для товарів: {e}, використовуємо спрощений метод")
            # Fallback до простого методу
            html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            html_content = re.sub(r'<!--.*?-->', '', html_content, flags=re.DOTALL)
            html_content = re.sub(r'\s+', ' ', html_content)
            return html_content[:100000]  # Збільшуємо ліміт
    
    def _extract_json_ld(self, html_content: str) -> Optional[Dict]:
        """Витягує JSON-LD структуровані дані з HTML"""
        try:
            # Шукаємо всі script теги з type="application/ld+json"
            pattern = r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
            matches = re.findall(pattern, html_content, re.DOTALL | re.IGNORECASE)
            
            for match in matches:
                try:
                    data = json.loads(match.strip())
                    # Шукаємо дані про продукт
                    if isinstance(data, dict):
                        if data.get("@type") in ["Product", "Offer"]:
                            return data
                        # Якщо це масив, шукаємо Product всередині
                        if isinstance(data.get("@graph"), list):
                            for item in data.get("@graph", []):
                                if item.get("@type") in ["Product", "Offer"]:
                                    return item
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and item.get("@type") in ["Product", "Offer"]:
                                return item
                except json.JSONDecodeError:
                    continue
            return None
        except Exception as e:
            logger.warning(f"Помилка витягування JSON-LD: {e}")
            return None

    def _parse_with_gpt(self, content: str, is_first: bool) -> Dict:
        """Використовує GPT для парсингу контенту"""
        if is_first:
            system_prompt = """Ти експерт з парсингу товарів з інтернет-магазинів. 
Проаналізуй HTML контент сторінки та витягни наступну інформацію:

1. Назва товару (name) - повна назва товару зі сторінки

2. Артикул/SKU (sku) - КРИТИЧНО ВАЖЛИВО! Знайди правильний артикул товару.
   Шукай у наступних місцях (перевіряй ВСІ варіанти):
   - Текст "Артикул:" або "Артикул " після якого йде число (наприклад: "Артикул: 123106" → "123106")
   - Текст "SKU:", "Код:", "Артикул:", "Арт." після якого йде код
   - Елементи з класами/ID: "sku", "article", "artikul", "product-code", "product-id", "code"
   - Атрибути: data-sku, data-article, data-code, itemprop="sku"
   - JSON-LD: поле "sku" або "productID"
   - Мета-теги: meta property="product:retailer_item_id"
   - Якщо знайдено текст типу "Артикул: 123106", бери ТІЛЬКИ число "123106", без слова "Артикул"
   - Якщо є кілька варіантів, бери той, що йде після "Артикул:" або "Артикул "
   - Артикул може бути числом або комбінацією букв та цифр
   - Приклад: "Артикул: 123106" → "123106", "SKU: ABC123" → "ABC123"

3. Ціна (price) - КРИТИЧНО ВАЖЛИВО! Знайди актуальну ціну товару. 
   Шукай у наступних місцях (перевіряй ВСІ варіанти):
   - Теги з класами/ID: "price", "cost", "amount", "value", "product-price", "current-price", "price-current", "price-value"
   - Атрибути: data-price, data-cost, data-value, itemprop="price", content (в meta тегах)
   - JSON-LD структуровані дані (script type="application/ld+json") - шукай поле "price" або "offers.price"
   - Мета-теги: meta property="product:price:amount", meta itemprop="price"
   - Будь-які елементи з числами та символами валюти (₴, грн, UAH, $, €, USD, EUR)
   - Елементи з класами типу "old-price", "new-price" - бери НОВУ ціну
   - Якщо є кілька цін, бери найбільшу (актуальну) ціну
   - Ціна має бути ЧИСЛОМ (float), без символів валюти, пробілів, ком
   - Приклад: "25 999 грн" → 25999, "1,500.50" → 1500.50, "₴12,345" → 12345
   - Якщо ціна = 0 або порожня, поверни null

4. Наявність (availability) - КРИТИЧНО ВАЖЛИВО! Визнач статус наявності товару.
   Шукай у наступних місцях:
   - Текст кнопок: "Купити", "В кошик", "Додати до кошика", "Замовити", "Під замовлення"
   - Елементи з класами: "availability", "stock", "in-stock", "out-of-stock", "status"
   - Атрибути: data-availability, data-stock, itemprop="availability"
   - JSON-LD: поле "availability" або "offers.availability"
   - Текст на сторінці: "в наявності", "є в наявності", "немає в наявності", "під замовлення", "закінчився"
   - Якщо є кнопка "Купити" або "В кошик" БЕЗ обмежень → "в наявності"
   - Якщо кнопка неактивна або є текст "немає" → "немає в наявності"
   - Якщо є текст "під замовлення" → "під замовлення"
   - Якщо не вдалося визначити, але є ціна → "в наявності" (за замовчуванням)
   - Якщо не вдалося визначити і немає ціни → "немає в наявності"

5. Конкурент (competitor_name) - назва інтернет-магазину/конкурента.
   Шукай у наступних місцях:
   - Логотип сайту або текст у header/footer
   - Мета-теги: meta property="og:site_name", meta name="application-name"
   - Title сторінки (може містити назву магазину)
   - Домен URL (може дати підказку про назву)
   - Якщо не знайдено, спробуй визначити з домену URL

6. Категорії (category_path) - шлях категорій (breadcrumb навігація).
   Шукай у наступних місцях:
   - Елементи з класами: "breadcrumb", "breadcrumbs", "category-path", "nav-breadcrumb"
   - Послідовність посилань типу "Головна > Категорія > Підкатегорія > Товар"
   - JSON-LD: поле "breadcrumb" або "itemListElement"
   - Поверни як масив рядків, наприклад: ["Головна", "Електроніка", "Смартфони"]
   - Якщо не знайдено, поверни порожній масив []

ВАЖЛИВО: 
- Якщо ціну не знайдено або вона = 0, поверни null для price
- Обов'язково вкажи availability навіть якщо не впевнений - використовуй логічні висновки
- Якщо товар має ціну, але немає явного статусу наявності, вважай що "в наявності"
- Для SKU обов'язково шукай текст "Артикул:" або "Артикул " перед числом

Поверни результат у форматі JSON:
{
  "name": "...",
  "sku": "...",
  "price": число або null,
  "availability": "в наявності" | "немає в наявності" | "під замовлення",
  "competitor_name": "...",
  "category_path": ["Категорія 1", "Категорія 2", ...]
}"""
        else:
            system_prompt = """Ти експерт з парсингу товарів. 
Проаналізуй HTML контент сторінки та витягни тільки:

1. Ціна (price) - КРИТИЧНО ВАЖЛИВО! Знайди актуальну ціну товару.
   Шукай у наступних місцях (перевіряй ВСІ варіанти):
   - Теги з класами/ID: "price", "cost", "amount", "value", "product-price", "current-price", "price-current", "price-value"
   - Атрибути: data-price, data-cost, data-value, itemprop="price", content (в meta тегах)
   - JSON-LD структуровані дані (script type="application/ld+json") - шукай поле "price" або "offers.price"
   - Мета-теги: meta property="product:price:amount", meta itemprop="price"
   - Будь-які елементи з числами та символами валюти (₴, грн, UAH, $, €, USD, EUR)
   - Елементи з класами типу "old-price", "new-price" - бери НОВУ ціну
   - Якщо є кілька цін, бери найбільшу (актуальну) ціну
   - Ціна має бути ЧИСЛОМ (float), без символів валюти, пробілів, ком
   - Приклад: "25 999 грн" → 25999, "1,500.50" → 1500.50, "₴12,345" → 12345
   - Якщо ціна = 0 або порожня, поверни null

2. Наявність (availability) - КРИТИЧНО ВАЖЛИВО! Визнач статус наявності товару.
   Шукай у наступних місцях:
   - Текст кнопок: "Купити", "В кошик", "Додати до кошика", "Замовити", "Під замовлення"
   - Елементи з класами: "availability", "stock", "in-stock", "out-of-stock", "status"
   - Атрибути: data-availability, data-stock, itemprop="availability"
   - JSON-LD: поле "availability" або "offers.availability"
   - Текст на сторінці: "в наявності", "є в наявності", "немає в наявності", "під замовлення", "закінчився"
   - Якщо є кнопка "Купити" або "В кошик" БЕЗ обмежень → "в наявності"
   - Якщо кнопка неактивна або є текст "немає" → "немає в наявності"
   - Якщо є текст "під замовлення" → "під замовлення"
   - Якщо не вдалося визначити, але є ціна → "в наявності" (за замовчуванням)
   - Якщо не вдалося визначити і немає ціни → "немає в наявності"

ВАЖЛИВО:
- Якщо ціну не знайдено або вона = 0, поверни null для price
- Обов'язково вкажи availability навіть якщо не впевнений - використовуй логічні висновки
- Якщо товар має ціну, але немає явного статусу наявності, вважай що "в наявності"

Поверни результат у форматі JSON:
{
  "price": число або null,
  "availability": "в наявності" | "немає в наявності" | "під замовлення"
}"""

        # Оптимізуємо HTML для швидшого парсингу
        optimized_content = self._optimize_html(content)
        
        # Також намагаємося витягти JSON-LD дані, якщо вони є
        json_ld_data = self._extract_json_ld(content)
        json_ld_hint = ""
        if json_ld_data:
            json_ld_hint = f"\n\nВАЖЛИВО: На сторінці знайдено структуровані дані JSON-LD:\n{json.dumps(json_ld_data, ensure_ascii=False, indent=2)}\nВикористовуй ці дані для визначення ціни та наявності!"
        
        user_prompt = f"""Проаналізуй цей HTML контент сторінки товару та витягни потрібну інформацію.
Особливо уважно шукай ціну товару та статус наявності - вони можуть бути в різних місцях HTML.
Перевіряй ВСІ можливі місця: теги, атрибути, JSON-LD дані, мета-теги.

{json_ld_hint}

HTML контент:
{optimized_content}
"""

        try:
            # GPT API використовує таймаут з ініціалізації клієнта
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            logger.info(f"GPT відповідь: {result_text[:500]}...")  # Логуємо перші 500 символів
            parsed_result = json.loads(result_text)
            
            # Логуємо детальну інформацію
            price = parsed_result.get('price')
            availability = parsed_result.get('availability')
            logger.info(f"Розпарсено: price={price} (тип: {type(price)}), availability={availability}")
            
            # Додаткова валідація - якщо ціна 0, вважаємо її null
            if price == 0:
                logger.warning("Знайдено ціну = 0, встановлюємо null")
                parsed_result['price'] = None
            
            # Додаємо інформацію про токени
            usage = response.usage
            if usage:
                parsed_result['_token_usage'] = {
                    'prompt_tokens': usage.prompt_tokens,
                    'completion_tokens': usage.completion_tokens,
                    'total_tokens': usage.total_tokens
                }
                logger.info(f"Використано токенів: {usage.total_tokens} (prompt: {usage.prompt_tokens}, completion: {usage.completion_tokens})")
            
            return parsed_result
        except json.JSONDecodeError as e:
            logger.error(f"Помилка парсингу JSON від GPT: {e}")
            logger.error(f"Відповідь GPT: {result_text[:500]}")
            raise Exception(f"Помилка парсингу JSON від GPT: {str(e)}")
        except Exception as e:
            logger.error(f"Помилка GPT парсингу: {str(e)}")
            raise Exception(f"Помилка GPT парсингу: {str(e)}")

    def parse_first_time(self, url: str) -> Dict:
        """Парсить товар вперше - збирає всю інформацію"""
        for attempt in range(self.max_retries):
            try:
                content = self._fetch_page_content(url)
                parsed_data = self._parse_with_gpt(content, is_first=True)
                
                # Валідація даних
                required_fields = ["name", "sku", "availability"]
                for field in required_fields:
                    if field not in parsed_data:
                        raise ValueError(f"Відсутнє поле: {field}")
                
                # Обробка ціни
                if "price" not in parsed_data or parsed_data["price"] is None:
                    parsed_data["price"] = None
                elif isinstance(parsed_data["price"], str):
                    # Очищаємо рядок від символів валюти та пробілів
                    price_str = parsed_data["price"].strip()
                    # Видаляємо символи валюти
                    for currency in ["₴", "грн", "UAH", "$", "€", "USD", "EUR", "руб", "₽", "грн.", "грн,"]:
                        price_str = price_str.replace(currency, "")
                    # Замінюємо кому на крапку та видаляємо пробіли
                    price_str = price_str.replace(",", ".").replace(" ", "").strip()
                    try:
                        price_value = float(price_str) if price_str else None
                        # Якщо ціна = 0, вважаємо її null
                        parsed_data["price"] = price_value if price_value and price_value > 0 else None
                    except (ValueError, AttributeError):
                        parsed_data["price"] = None
                elif isinstance(parsed_data["price"], (int, float)):
                    # Якщо ціна = 0, вважаємо її null
                    price_value = float(parsed_data["price"])
                    parsed_data["price"] = price_value if price_value > 0 else None
                else:
                    parsed_data["price"] = None
                
                return parsed_data
            except ProductNotFoundError:
                # Прокидаємо ProductNotFoundError далі без обгортання
                raise
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise Exception(f"Помилка після {self.max_retries} спроб: {str(e)}")
                time.sleep(2 ** attempt)  # Exponential backoff
        
        raise Exception("Не вдалося спарсити товар")

    def parse_update(self, url: str) -> Dict:
        """Парсить товар для оновлення - тільки ціна та наявність"""
        for attempt in range(self.max_retries):
            try:
                content = self._fetch_page_content(url)
                parsed_data = self._parse_with_gpt(content, is_first=False)
                
                # Валідація даних
                required_fields = ["availability"]
                for field in required_fields:
                    if field not in parsed_data:
                        raise ValueError(f"Відсутнє поле: {field}")
                
                # Обробка ціни
                if "price" not in parsed_data or parsed_data["price"] is None:
                    parsed_data["price"] = None
                elif isinstance(parsed_data["price"], str):
                    # Очищаємо рядок від символів валюти та пробілів
                    price_str = parsed_data["price"].strip()
                    # Видаляємо символи валюти
                    for currency in ["₴", "грн", "UAH", "$", "€", "USD", "EUR", "руб", "₽", "грн.", "грн,"]:
                        price_str = price_str.replace(currency, "")
                    # Замінюємо кому на крапку та видаляємо пробіли
                    price_str = price_str.replace(",", ".").replace(" ", "").strip()
                    try:
                        price_value = float(price_str) if price_str else None
                        # Якщо ціна = 0, вважаємо її null
                        parsed_data["price"] = price_value if price_value and price_value > 0 else None
                    except (ValueError, AttributeError):
                        parsed_data["price"] = None
                elif isinstance(parsed_data["price"], (int, float)):
                    # Якщо ціна = 0, вважаємо її null
                    price_value = float(parsed_data["price"])
                    parsed_data["price"] = price_value if price_value > 0 else None
                else:
                    parsed_data["price"] = None
                
                return parsed_data
            except ProductNotFoundError:
                # Прокидаємо ProductNotFoundError далі без обгортання
                raise
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise Exception(f"Помилка після {self.max_retries} спроб: {str(e)}")
                time.sleep(2 ** attempt)  # Exponential backoff
        
        raise Exception("Не вдалося оновити дані товару")

    def generate_parsing_rules(self, url: str, existing_data: Optional[Dict] = None) -> Dict:
        """Генерує правила парсингу для товару через GPT"""
        try:
            content = self._fetch_page_content(url)
            optimized_content = self._optimize_html(content)
            
            system_prompt = """Ти експерт з парсингу товарів з інтернет-магазинів.
Проаналізуй HTML контент сторінки товару та створи CSS селектори для витягування даних.

Ти повинен створити JSON об'єкт з правилами парсингу у форматі:
{
  "name": {
    "selector": "CSS селектор для назви товару",
    "attribute": "text" або "data-атрибут" або null
  },
  "sku": {
    "selector": "CSS селектор для SKU/артикулу",
    "attribute": "text" або "data-атрибут" або null
  },
  "price": {
    "selector": "CSS селектор для ціни",
    "attribute": "text" або "data-price" або "content" або null
  },
  "availability": {
    "selector": "CSS селектор для статусу наявності",
    "attribute": "text" або "data-атрибут" або null
  },
  "category_path": {
    "selector": "CSS селектор для breadcrumb (наприклад, .breadcrumb a)",
    "attribute": "text"
  }
}

ВАЖЛИВО:
- Селектори повинні бути максимально точними та стабільними
- Якщо дані в атрибутах (data-price, data-availability), вкажи attribute
- Якщо дані в тексті елемента, вкажи attribute: "text"
- Якщо не вдалося знайти селектор, вкажи null
- Для category_path використовуй селектор для всіх елементів breadcrumb"""

            existing_rules_hint = ""
            if existing_data:
                existing_rules_hint = f"\n\nІснуючі дані товару:\n{json.dumps(existing_data, ensure_ascii=False, indent=2)}\nВикористовуй ці дані для перевірки правильності селекторів."

            user_prompt = f"""Проаналізуй цей HTML контент сторінки товару та створи CSS селектори для витягування даних.
{existing_rules_hint}

HTML контент:
{optimized_content}
"""

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            rules = json.loads(result_text)
            
            # Додаємо інформацію про токени
            usage = response.usage
            if usage:
                rules['_token_usage'] = {
                    'prompt_tokens': usage.prompt_tokens,
                    'completion_tokens': usage.completion_tokens,
                    'total_tokens': usage.total_tokens
                }
            
            return rules
        except Exception as e:
            logger.error(f"Помилка генерації правил: {str(e)}")
            raise Exception(f"Помилка генерації правил: {str(e)}")

    def test_parsing_rules(self, url: str, rules: Dict) -> Dict:
        """Тестує правила парсингу на сторінці"""
        try:
            content = self._fetch_page_content(url)
            soup = BeautifulSoup(content, 'html.parser')
            
            extracted = {}
            errors = []
            
            for field, rule in rules.items():
                if field == "_token_usage" or not isinstance(rule, dict):
                    continue
                    
                selector = rule.get("selector")
                attribute = rule.get("attribute", "text")
                
                if not selector:
                    continue
                
                try:
                    elements = soup.select(selector)
                    if not elements:
                        errors.append(f"Поле '{field}': селектор '{selector}' не знайдено")
                        continue
                    
                    if field == "category_path":
                        # Для breadcrumb беремо всі елементи
                        values = []
                        for elem in elements:
                            if attribute == "text":
                                values.append(elem.get_text(strip=True))
                            else:
                                values.append(elem.get(attribute, ""))
                        extracted[field] = [v for v in values if v]
                    else:
                        # Для інших полів беремо перший елемент
                        elem = elements[0]
                        if attribute == "text":
                            value = elem.get_text(strip=True)
                        else:
                            value = elem.get(attribute, "")
                        extracted[field] = value
                        
                except Exception as e:
                    errors.append(f"Поле '{field}': помилка '{str(e)}'")
            
            success = len(errors) == 0 and len(extracted) > 0
            
            return {
                "success": success,
                "extracted": extracted,
                "errors": errors
            }
        except Exception as e:
            logger.error(f"Помилка тестування правил: {str(e)}")
            return {
                "success": False,
                "extracted": {},
                "errors": [f"Помилка тестування: {str(e)}"]
            }

    def parse_competitor_categories(self, url: str) -> list:
        """Парсить категорії конкурента через GPT з retry логікою"""
        # Збільшуємо таймаут для парсингу категорій (120 секунд) та додаємо retry
        content = None
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Спроба {attempt + 1}/{self.max_retries} отримання сторінки для парсингу категорій: {url}")
                content = self._fetch_page_content(url, timeout=120.0, max_retries=2)  # Менше retry для внутрішнього виклику
                break  # Якщо успішно, виходимо з циклу
            except Exception as e:
                logger.warning(f"Спроба {attempt + 1}/{self.max_retries} не вдалася: {str(e)}")
                if attempt < self.max_retries - 1:
                    wait_time = 3 * (attempt + 1)  # 3s, 6s, 9s
                    logger.info(f"Очікування {wait_time} секунд перед наступною спробою...")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"Не вдалося отримати сторінку {url} після {self.max_retries} спроб: {str(e)}")
        
        try:
            # Для парсингу категорій використовуємо більше HTML контенту
            optimized_content = self._optimize_html_for_categories(content)
            
            system_prompt = """Ти експерт з аналізу структури інтернет-магазинів.
Проаналізуй HTML контент головної сторінки та витягни ВСЮ структуру категорій товарів.

КРИТИЧНО ВАЖЛИВО - ТИ ПОВИНЕН ЗНАЙТИ ВСІ КАТЕГОРІЇ БЕЗ ВИНЯТКУ!

Ти повинен обов'язково перевірити ВСІ можливі місця де можуть бути категорії:

1. ГОЛОВНЕ МЕНЮ НАВІГАЦІЇ (header, nav, menu) - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Знайди основне меню навігації у header
   - Шукай елементи з класами: "menu", "nav", "navigation", "main-menu", "header-menu", "top-menu", "primary-nav", "navbar"
   - Перевір всі <nav>, <ul>, <li> елементи з посиланнями на категорії
   - Перевір mega-menu (великі випадаючі меню)
   - Перевір всі рівні вкладеності в меню (батьківські, дочірні, внучата, правнуки)

2. FOOTER (нижня частина сторінки) - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Категорії часто є у footer
   - Шукай блоки з посиланнями на категорії у footer
   - Перевір <footer> та всі його дочірні елементи
   - Перевір колонки footer (footer-column, footer-nav, footer-links)
   - Перевір sitemap у footer

3. САЙДБАР (sidebar, бокова панель) - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Шукай категорії у боковій панелі
   - Елементи з класами: "sidebar", "categories", "category-list", "category-menu", "catalog-menu"
   - Перевір фільтри категорій у sidebar

4. МОБІЛЬНЕ МЕНЮ - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Перевір меню для мобільних пристроїв
   - Елементи з класами: "mobile-menu", "burger-menu", "menu-toggle", "mobile-nav"
   - Перевір приховані меню (display: none, hidden)

5. КАТАЛОГ ТОВАРІВ (якщо є на головній) - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Блоки з категоріями товарів
   - Елементи з класами: "catalog", "categories", "product-categories", "category-grid", "category-block"
   - Перевір блоки "Популярні категорії", "Всі категорії"

6. ДРОПДАУН МЕНЮ - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Розгорніть всі dropdown меню (якщо можливо)
   - Знайди підкатегорії у dropdown списках
   - Перевір hover-меню та click-меню
   - Перевір всі рівні вкладеності в dropdown

7. SITEMAP (якщо є) - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Перевір посилання на sitemap.xml
   - Або HTML sitemap на сторінці
   - Перевір посилання типу "/sitemap", "/sitemap.html"

8. БЛОКИ З ПОСИЛАННЯМИ - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - ВСІ <a> теги з href, що ведуть на категорії
   - Елементи з data-атрибутами категорій (data-category, data-cat-id)
   - Посилання з класами типу "category-link", "cat-link"

9. ДОДАТКОВІ МІСЦЯ - ОБОВ'ЯЗКОВО ПЕРЕВІР:
   - Баннери з посиланнями на категорії
   - Блоки "Рекомендовані категорії"
   - Блоки "Швидкий доступ"
   - Всі елементи з атрибутами типу "data-category-id", "data-cat"

ВАЖЛИВО - КРИТИЧНО:
- ТИ ПОВИНЕН ЗНАЙТИ ВСІ КАТЕГОРІЇ БЕЗ ВИНЯТКУ, НЕ ТІЛЬКИ ОСНОВНІ
- Перевір ВСІ можливі місця вище - КОЖНЕ місце обов'язково перевір
- Шукай навіть приховані елементи (наприклад, меню які відкриваються при hover)
- Знайди ВСІ рівні вкладеності (батьківські, дочірні, внучата категорії, правнуки, праправнуки)
- Якщо є mega-menu, знайди ВСІ його розділи та підрозділи
- Перевір ВСІ <a> теги з href - кожен може бути категорією
- Не пропускай категорії з footer, sidebar, dropdown меню
- Якщо бачиш повторювані посилання на категорії в різних місцях - включи їх ВСІ
- Шукай категорії у всіх <ul> та <li> елементах
- Перевір навіть другорядні меню та блоки категорій
- Перевір всі можливі варіанти назв класів та ID

СТВОРИ ДЕРЕВО КАТЕГОРІЙ у форматі JSON об'єкта з полем "categories" (масив), де кожна категорія має:
- id: унікальний ідентифікатор (обов'язково використовуй slug з URL, якщо URL є)
- name: повна назва категорії (як вона відображається на сайті, точно)
- url: ОБОВ'ЯЗКОВО повний абсолютний URL посилання на категорію (https://example.com/category/electronics)
  * Якщо URL відносний (починається з "/"), додай базовий домен
  * Якщо URL починається з "./" або без "/", додай базовий домен + шлях
  * URL має бути повністю робочим посиланням
- children: масив підкатегорій (якщо є, інакше порожній масив [])

Приклад структури:
{
  "categories": [
    {
      "id": "electronics",
      "name": "Електроніка",
      "url": "https://example.com/electronics",
      "children": [
        {
          "id": "smartphones",
          "name": "Смартфони",
          "url": "https://example.com/electronics/smartphones",
          "children": []
        }
      ]
    }
  ]
}

КРИТИЧНО ВАЖЛИВО - ФІНАЛЬНА ПЕРЕВІРКА:
1. Для кожної категорії ОБОВ'ЯЗКОВО вкажи правильний повний URL (з доменом, наприклад: "https://example.com/category/electronics")
2. Якщо URL відносний (наприклад: "/category/electronics" або "category/electronics"), додай базовий домен
3. Знайди ВСІ категорії без винятку - перевір header, footer, sidebar, dropdown меню, всі посилання
4. Зберігай правильну ієрархію (батьківські → дочірні → внучата → правнуки)
5. Не пропускай жодну категорію - мета знайти МАКСИМАЛЬНО ПОВНУ структуру
6. Якщо бачиш категорію в header і в footer - включи її (це нормально)
7. Перевір ВСІ рівні вкладеності - не тільки 2-3 рівні, а всі що є
8. Кожна категорія МАЄ мати URL - якщо його немає в HTML, спробуй його побудувати на основі назви та базового URL

ПОМНИ: КРАЩЕ ЗНАЙТИ БАГАТО КАТЕГОРІЙ (навіть з повтореннями), НІЖ ПРОПУСТИТИ ЇХ!"""

            user_prompt = f"""Проаналізуй цей HTML контент головної сторінки інтернет-магазину та витягни ВСЮ структуру категорій.

КРИТИЧНО ВАЖЛИВО - ТИ ПОВИНЕН ЗНАЙТИ ВСІ КАТЕГОРІЇ БЕЗ ВИНЯТКУ!

ОБОВ'ЯЗКОВО перевір КОЖНЕ з цих місць:
1. Header навігацію (меню у верхній частині) - перевір ВСІ елементи меню
2. Footer (нижня частина сторінки) - перевір ВСІ посилання у footer
3. Sidebar (якщо є) - перевір ВСІ категорії у sidebar
4. Мобільне меню - перевір приховані меню
5. Dropdown меню та підкатегорії - перевір ВСІ рівні вкладеності
6. Всі блоки з посиланнями на категорії - перевір КОЖНЕ посилання
7. Sitemap або карту сайту - якщо є на сторінці
8. Баннери та блоки з категоріями - перевір ВСІ блоки
9. Всі <a> теги з href - перевір КОЖНЕ посилання

ВАЖЛИВО: 
- Знайди ВСІ категорії, не тільки основні
- Перевір кожен елемент навігації та кожне посилання
- Не пропускай жодну категорію - краще знайти багато, ніж пропустити
- Перевір ВСІ рівні вкладеності (батьківські, дочірні, внучата, правнуки)
- Якщо бачиш категорію в кількох місцях - включи її (це нормально)

Базовий URL сайту: {url}

HTML контент:
{optimized_content}

Поверни структуру категорій у форматі JSON об'єкта з полем "categories" (масив ВСІХ категорій, які ти знайшов)."""

            # GPT API виклик з retry логікою
            result_text = None
            for gpt_attempt in range(self.max_retries):
                try:
                    logger.info(f"Спроба {gpt_attempt + 1}/{self.max_retries} GPT API для парсингу категорій")
                    response = self.client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.3,
                        response_format={"type": "json_object"}
                    )
                    result_text = response.choices[0].message.content
                    break  # Якщо успішно, виходимо з циклу
                except Exception as e:
                    logger.warning(f"Спроба {gpt_attempt + 1}/{self.max_retries} GPT API не вдалася: {str(e)}")
                    if gpt_attempt < self.max_retries - 1:
                        wait_time = 5 * (gpt_attempt + 1)  # 5s, 10s, 15s
                        logger.info(f"Очікування {wait_time} секунд перед наступною спробою GPT API...")
                        time.sleep(wait_time)
                    else:
                        raise Exception(f"Не вдалося отримати відповідь від GPT API після {self.max_retries} спроб: {str(e)}")
            
            if not result_text:
                raise Exception("Не вдалося отримати відповідь від GPT API")
            
            result = json.loads(result_text)
            
            # Очікуємо, що GPT поверне об'єкт з полем "categories" або прямий масив
            if "categories" in result:
                categories = result["categories"]
            elif isinstance(result, list):
                categories = result
            else:
                categories = []
            
            # Обробляємо категорії: конвертуємо відносні URL в абсолютні та генеруємо ID
            from urllib.parse import urljoin, urlparse
            import hashlib
            
            def process_category(cat, base_url):
                """Обробляє категорію: конвертує URL та генерує ID"""
                # Конвертуємо відносний URL в абсолютний
                if cat.get("url") and cat["url"] and cat["url"].strip() != "":
                    url_str = str(cat["url"]).strip()
                    if not url_str.startswith("http"):
                        # Якщо URL починається з "/", додаємо базовий домен
                        if url_str.startswith("/"):
                            from urllib.parse import urlparse
                            parsed_base = urlparse(base_url)
                            cat["url"] = f"{parsed_base.scheme}://{parsed_base.netloc}{url_str}"
                        else:
                            cat["url"] = urljoin(base_url, url_str)
                
                # Генеруємо ID на основі URL або назви, якщо його немає або він не валідний
                if not cat.get("id") or cat["id"] == "":
                    # Створюємо ID на основі URL або назви
                    if cat.get("url"):
                        # Беремо slug з URL
                        parsed = urlparse(cat["url"])
                        path = parsed.path.strip("/").replace("/", "-")
                        cat["id"] = path if path else hashlib.md5(cat["url"].encode()).hexdigest()[:12]
                    else:
                        # Якщо немає URL, використовуємо назву
                        name_slug = cat.get("name", "").lower().replace(" ", "-").replace("/", "-")
                        cat["id"] = hashlib.md5(name_slug.encode()).hexdigest()[:12]
                
                # Обробляємо дочірні категорії рекурсивно
                if cat.get("children") and isinstance(cat["children"], list):
                    cat["children"] = [process_category(child, base_url) for child in cat["children"]]
                
                return cat
            
            # Обробляємо всі категорії
            processed_categories = [process_category(cat, url) for cat in categories]
            
            # Додаємо інформацію про токени
            usage = response.usage
            if usage:
                logger.info(f"Використано токенів для парсингу категорій: {usage.total_tokens}")
            
            logger.info(f"Знайдено категорій: {len(processed_categories)}")
            
            return processed_categories
        except Exception as e:
            logger.error(f"Помилка парсингу категорій: {str(e)}")
            raise Exception(f"Помилка парсингу категорій: {str(e)}")

    def parse_category_name(self, category_url: str) -> str:
        """Парсить назву категорії з URL через GPT"""
        try:
            content = self._fetch_page_content(category_url)
            optimized_content = self._optimize_html(content)
            
            system_prompt = """Ти експерт з аналізу інтернет-магазинів.
Проаналізуй HTML контент сторінки категорії та витягни назву категорії.

Ти повинен знайти назву категорії в наступних місцях:
1. Заголовок сторінки (h1, h2) - найчастіше тут
2. Title сторінки (тег <title>)
3. Breadcrumb навігація (останній елемент)
4. Мета-теги (og:title, meta name="title")
5. Заголовки з класами типу "category-title", "page-title"

ВАЖЛИВО:
- Назва має бути точною назвою категорії як вона відображається на сайті
- Якщо є кілька варіантів, бери найбільш точний (зазвичай з h1)
- Видаляй зайві слова типу "Категорія:", "Розділ:" тощо
- Поверни тільки назву категорії, без додаткового тексту

Поверни результат у форматі JSON:
{
  "name": "Назва категорії"
}"""

            user_prompt = f"""Проаналізуй цей HTML контент сторінки категорії та витягни назву категорії.

URL категорії: {category_url}

HTML контент:
{optimized_content}

Поверни назву категорії у форматі JSON об'єкта з полем "name"."""

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            result = json.loads(result_text)
            
            category_name = result.get("name", "").strip()
            
            if not category_name:
                logger.warning(f"Не вдалося витягти назву категорії з {category_url}")
                # Якщо не вдалося витягти, спробуємо з URL
                from urllib.parse import urlparse
                parsed = urlparse(category_url)
                path = parsed.path.strip("/").split("/")[-1]
                category_name = path.replace("-", " ").replace("_", " ").title()
            
            logger.info(f"Витягнуто назву категорії: {category_name}")
            return category_name
            
        except Exception as e:
            logger.error(f"Помилка парсингу назви категорії: {str(e)}")
            # Якщо помилка, спробуємо з URL
            try:
                from urllib.parse import urlparse
                parsed = urlparse(category_url)
                path = parsed.path.strip("/").split("/")[-1]
                return path.replace("-", " ").replace("_", " ").title()
            except:
                return "Категорія"

    def parse_category_products(self, category_url: str) -> Dict:
        """
        Парсить сторінку категорії та повертає розділено:
        - products: список товарів
        - categories: список підкатегорій (якщо сторінка містить переважно категорії)
        - page_type: product_list | category_list | mixed | unknown

        Це потрібно, щоб відрізняти "сторінку зі списком товарів" від "сторінки зі списком підкатегорій"
        і не зберігати категорії як товари.
        """
        try:
            content = self._fetch_page_content(category_url)
            # Використовуємо спеціальну оптимізацію для товарів (зберігаємо важливі частини)
            optimized_content = self._optimize_html_for_products(content)
            
            system_prompt = """Ти експерт з парсингу товарів з інтернет-магазинів.
Проаналізуй HTML контент сторінки розділу (категорії) та ВІДОКРЕМИ:
1) ТОВАРИ (product detail pages)
2) ПІДКАТЕГОРІЇ (category/listing pages)

КРИТИЧНО: НЕ ПОВЕРТАЙ КАТЕГОРІЇ У СПИСКУ "products".

КРИТИЧНО ВАЖЛИВО - ТИ ПОВИНЕН ЗНАЙТИ ВСІ ТОВАРИ БЕЗ ВИНЯТКУ!

Ти повинен обов'язково перевірити ВСІ можливі місця де можуть бути товари:

1. СІТКА/СПИСОК ТОВАРІВ (основна частина):
   - Елементи з класами: "products", "product-list", "product-grid", "items", "catalog-items"
   - Елементи з класами: "product-item", "product-card", "product-box", "item-card"
   - Елементи з класами: "ty-grid-list", "ty-product-list", "ty-product-item", "ty-product-block"
   - Всі <div>, <article>, <li>, <section> елементи з посиланнями на товари
   - Елементи з data-атрибутами: data-product-id, data-product-url, data-item-id, data-id

2. КАРУСЕЛІ ТОВАРІВ:
   - Елементи з класами: "carousel", "slider", "swiper", "products-carousel"
   - Товари у блоках "Популярні", "Рекомендовані", "Новинки", "Акції"
   - Елементи з класами: "featured-products", "popular-products", "recommended"

3. БЛОКИ З ТОВАРАМИ:
   - Всі блоки з класами типу "product-*", "item-*", "goods-*"
   - Елементи з класами: "catalog", "goods-list", "items-list"
   - JSON-LD структуровані дані (script type="application/ld+json") з типом "Product" або "ItemList"
   - Всі контейнери (div, article, li), що містять посилання та текст

4. ПОСИЛАННЯ НА ТОВАРИ (КРИТИЧНО ВАЖЛИВО!):
   - ВСІ <a> теги з href, що ведуть на сторінки товарів
   - Посилання в елементах з класами типу "product-link", "item-link"
   - Посилання з атрибутами data-href, data-url
   - Кожне посилання, що містить текст (назву товару) та веде на сторінку товару
   - НЕ включай посилання на категорії, пагінацію, соцмережі

5. СПЕЦІАЛЬНІ СТРУКТУРИ:
   - Елементи з класами: "product-tile", "product-wrapper", "product-container"
   - Елементи з класами: "grid-item", "list-item", "catalog-item"
   - Всі елементи, що містять назву товару та посилання

6. JSON-LD ДАНІ (ДУЖЕ ВАЖЛИВО!):
   - Перевір ВСІ JSON-LD структуровані дані
   - Шукай масиви товарів (ItemList, Product)
   - Витягни всі товари з JSON-LD, навіть якщо вони є в HTML

ВАЖЛИВО - КРИТИЧНО:
- ТИ ПОВИНЕН ЗНАЙТИ ВСІ ТОВАРИ НА СТОРІНЦІ, НЕ ПРОПУСКАЙ ЖОДНОГО
- Перевір ВСІ можливі місця вище
- Шукай навіть приховані елементи (наприклад, товари в каруселях)
- Якщо бачиш повторювані товари в різних місцях - включи їх ВСІ (потім видалимо дублікати)
- Перевір ВСІ <a> теги з href - кожен може бути товаром
- Шукай товари у всіх <div>, <article>, <li>, <section> елементах
- Перевір навіть другорядні блоки та каруселі
- ОСОБЛИВО УВАЖНО перевір JSON-LD дані - там може бути повний список товарів

== Як відрізнити товар від категорії ==
Товар (product detail page) зазвичай:
- має ціну/availability/кнопку "Купити/В кошик" у карточці
- або присутній у JSON-LD як @type="Product"
- або URL виглядає як сторінка конкретного товару (часто глибший шлях, інколи .html)

Категорія/підкатегорія (listing page) зазвичай:
- показує інші підкатегорії, фільтри, сортировку, пагінацію
- не має ознак конкретного товару (sku/ціна/offer) у самій карточці
- URL часто веде на розділ/каталог/категорію (але назви можуть відрізнятись — орієнтуйся на ознаки сторінки)

Якщо ти НЕ ВПЕВНЕНИЙ — віднеси елемент до categories, а не до products.

Для кожного товару витягни:
1. Назва товару (name) - ОБОВ'ЯЗКОВО! Повна назва товару зі сторінки
2. URL товару (url) - ОБОВ'ЯЗКОВО! Повний абсолютний URL посилання на товар
   * Якщо URL відносний (починається з "/"), додай базовий домен
   * Якщо URL починається з "./" або без "/", додай базовий домен + шлях
   * URL має бути повністю робочим посиланням
3. SKU/Артикул (sku) - якщо є на сторінці категорії (може бути null)
4. Ціна (price) - якщо є на сторінці категорії (може бути null)
5. Наявність (availability) - якщо є на сторінці категорії (може бути null)

КРИТИЧНО ВАЖЛИВО - ФІНАЛЬНА ПЕРЕВІРКА:
1. Для кожного товару ОБОВ'ЯЗКОВО вкажи правильний повний URL (з доменом)
2. Якщо URL відносний, додай базовий домен
3. Знайди ВСІ товари без винятку - перевір всі блоки, каруселі, списки, JSON-LD
4. Не пропускай жодного товару - мета знайти МАКСИМАЛЬНО ПОВНИЙ список
5. Якщо бачиш товар в основному списку і в каруселі - включи його (це нормально, видалимо дублікати)
6. Перевір ВСІ можливі місця - не тільки основні, а всі що є
7. Кожен товар МАЄ мати URL - якщо його немає в HTML, спробуй його побудувати на основі назви та базового URL
8. ОСОБЛИВО УВАЖНО перевір JSON-LD - там часто є повний список товарів у структурованому форматі

ПОМНИ: КРАЩЕ ЗНАЙТИ БАГАТО ТОВАРІВ (навіть з повтореннями), НІЖ ПРОПУСТИТИ ЇХ!

== Формат відповіді ==
Поверни JSON об'єкт із трьома полями:
1) page_type: "product_list" | "category_list" | "mixed" | "unknown"
   - product_list: на сторінці переважно товари
   - category_list: на сторінці переважно підкатегорії/розділи, а товарів немає або майже немає
   - mixed: є і товари, і підкатегорії
   - unknown: не вдалося визначити

2) products: масив товарів (лише product detail pages), кожен має:
{
  "name": "Назва товару",
  "url": "https://example.com/product/123",
  "sku": "123456" або null,
  "price": 999.99 або null,
  "availability": "в наявності" | "немає в наявності" | "під замовлення" або null
}

3) categories: масив підкатегорій (listing pages), кожна має:
{
  "name": "Назва підкатегорії",
  "url": "https://example.com/category/sub"
}

ВАЖЛИВО:
- НЕ додавати пагінацію/сортування/фільтри як категорії (page=, sort=, filter= тощо)
- НЕ повертати URL, що дорівнює URL поточної сторінки категорії
"""

            user_prompt = f"""Проаналізуй цей HTML контент сторінки категорії та витягни список ВСІХ товарів.

ОБОВ'ЯЗКОВО перевір:
- Сітку/список товарів (основна частина сторінки)
- Каруселі товарів
- Блоки "Популярні", "Рекомендовані", "Новинки", "Акції"
- Всі посилання на товари (<a> теги)
- JSON-LD структуровані дані
- Всі елементи з класами типу "product-*", "item-*", "goods-*"

ВАЖЛИВО: Знайди ВСІ товари на сторінці, не пропускай жодного. Перевір кожен елемент та кожне посилання.

URL категорії: {category_url}

HTML контент:
{optimized_content}

Поверни результат у форматі JSON об'єкта з полями page_type, products, categories."""

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            logger.info(f"GPT відповідь для категорії (перші 1000 символів): {result_text[:1000]}...")
            
            try:
                result = json.loads(result_text)
            except json.JSONDecodeError as e:
                logger.error(f"Помилка парсингу JSON від GPT для категорії {category_url}: {str(e)}")
                logger.error(f"Повна відповідь GPT: {result_text}")
                raise Exception(f"Помилка парсингу JSON від GPT: {str(e)}")
            
            if not isinstance(result, dict):
                logger.warning(f"GPT повернув неочікуваний формат (не dict): {type(result)}")
                result = {}

            page_type = (result.get("page_type") or "").strip() if isinstance(result.get("page_type"), str) else ""
            raw_products = result.get("products", [])
            raw_categories = result.get("categories", [])

            if raw_products and not isinstance(raw_products, list):
                logger.warning(f"GPT повернув products не як список, а як {type(raw_products)}, конвертуємо...")
                raw_products = [raw_products]
            if raw_categories and not isinstance(raw_categories, list):
                logger.warning(f"GPT повернув categories не як список, а як {type(raw_categories)}, конвертуємо...")
                raw_categories = [raw_categories]

            if not isinstance(raw_products, list):
                raw_products = []
            if not isinstance(raw_categories, list):
                raw_categories = []

            logger.info(f"Витягнуто з відповіді GPT: products={len(raw_products)}, categories={len(raw_categories)}, page_type='{page_type or 'N/A'}'")

            # Обробляємо елементи: конвертуємо відносні URL в абсолютні, нормалізуємо та видаляємо дублікати
            from urllib.parse import urljoin, urlparse
            
            def normalize_url(u: Optional[str], base: str) -> Optional[str]:
                if not u:
                    return None
                url_str = str(u).strip()
                if not url_str:
                    return None
                if not url_str.startswith("http"):
                    if url_str.startswith("/"):
                        parsed_base = urlparse(base)
                        url_str = f"{parsed_base.scheme}://{parsed_base.netloc}{url_str}"
                    else:
                        url_str = urljoin(base, url_str)
                # нормалізація (без query/fragment)
                url_str = url_str.split("#")[0].split("?")[0].rstrip("/")
                return url_str or None

            category_url_norm = normalize_url(category_url, category_url)

            processed_products: list = []
            processed_categories: list = []
            seen_product_urls: set = set()
            seen_category_urls: set = set()

            # Фільтр для явних "не-категорій" у categories (пагінація/сортування/фільтри)
            def looks_like_non_category_url(u: str) -> bool:
                lowered = u.lower()
                # query вже відрізаний normalize_url, але залишаємо ще кілька грубих патернів
                bad_fragments = ["/page/", "/p/", "/filter/", "/sort/", "page-", "sort-", "filter-"]
                return any(x in lowered for x in bad_fragments)

            for idx, product in enumerate(raw_products):
                if not isinstance(product, dict):
                    continue
                p_url = normalize_url(product.get("url"), category_url)
                if not p_url:
                    continue
                if category_url_norm and p_url == category_url_norm:
                    continue
                if p_url in seen_product_urls:
                    continue
                name = (product.get("name") or "").strip()
                if not name:
                    name = "Товар без назви"
                processed_products.append({
                    "name": name,
                    "url": p_url,
                    "sku": product.get("sku"),
                    "price": product.get("price"),
                    "availability": product.get("availability"),
                })
                seen_product_urls.add(p_url)

            for idx, cat in enumerate(raw_categories):
                if not isinstance(cat, dict):
                    continue
                c_url = normalize_url(cat.get("url"), category_url)
                if not c_url:
                    continue
                if category_url_norm and c_url == category_url_norm:
                    continue
                if looks_like_non_category_url(c_url):
                    continue
                if c_url in seen_category_urls:
                    continue
                c_name = (cat.get("name") or "").strip()
                if not c_name:
                    continue
                processed_categories.append({
                    "name": c_name,
                    "url": c_url,
                })
                seen_category_urls.add(c_url)

            # Автовизначення page_type, якщо GPT не заповнив або заповнив некоректно
            allowed_page_types = {"product_list", "category_list", "mixed", "unknown"}
            if page_type not in allowed_page_types:
                if processed_products and processed_categories:
                    page_type = "mixed"
                elif processed_products:
                    page_type = "product_list"
                elif processed_categories:
                    page_type = "category_list"
                else:
                    page_type = "unknown"

            logger.info(
                f"Після пост-обробки: products={len(processed_products)}, categories={len(processed_categories)}, page_type='{page_type}'"
            )
            
            # Додаємо інформацію про токени
            usage = response.usage
            if usage:
                logger.info(f"Використано токенів для парсингу товарів категорії: {usage.total_tokens}")
            
            return {
                "page_type": page_type,
                "products": processed_products,
                "categories": processed_categories,
            }
        except json.JSONDecodeError as e:
            logger.error(f"Помилка парсингу JSON від GPT для категорії {category_url}: {str(e)}")
            logger.error(f"Відповідь GPT (перші 1000 символів): {result_text[:1000] if 'result_text' in locals() else 'N/A'}")
            raise Exception(f"Помилка парсингу JSON від GPT: {str(e)}")
        except KeyError as e:
            logger.error(f"Помилка доступу до поля в відповіді GPT: {str(e)}")
            logger.error(f"Відповідь GPT (перші 1000 символів): {result_text[:1000] if 'result_text' in locals() else 'N/A'}")
            raise Exception(f"Помилка обробки відповіді GPT: {str(e)}")
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"Помилка парсингу товарів категорії {category_url}: {str(e)}")
            logger.error(f"Деталі помилки: {error_details}")
            raise Exception(f"Помилка парсингу товарів категорії: {str(e)}")

