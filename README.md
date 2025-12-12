# GPT Product Parser

Проєкт для парсингу товарів з інтернет-магазинів за допомогою GPT API.

## Вимоги

- Python 3.11+
- OpenAI API ключ

## Встановлення

1. Встановіть залежності:
```bash
pip install -r requirements.txt
```

2. Запустіть сервер одним з способів:

**Спосіб 1 (Windows - подвійний клік):**
Просто подвійний клік на файл `run.bat` - він автоматично:
- Перевірить наявність Python
- Встановить залежності (якщо потрібно)
- Запустить сервер
- Відкриє браузер

**Спосіб 2 (через run.py):**
```bash
python run.py
```

**Спосіб 3 (через uvicorn):**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. Відкрийте браузер:
```
http://localhost:8000
```

## Перші кроки

1. Перейдіть на сторінку "Налаштування GPT API"
2. Додайте ваш OpenAI API ключ
3. Активуйте ключ
4. Поверніться на головну сторінку та додайте товар для парсингу
5. Натисніть "Спарсити цей товар" для отримання даних

## Структура проєкту

```
/app
  main.py          - FastAPI додаток
  parser.py        - Логіка парсингу
  gpt_client.py    - Клієнт для OpenAI API
  models.py        - Моделі даних
  db.json          - База даних товарів
  settings.json    - Налаштування API ключів
  static/          - Статичні файли (CSS, JS)
  templates/       - HTML шаблони
```

## Функціонал

- Додавання товарів для парсингу
- Парсинг товарів через GPT API
- Управління API ключами
- Збереження історії змін цін та наявності
- Автоматичне визначення першого парсингу

## API Endpoints

### Товари
- `POST /products/add` - Додати товар
- `GET /products/list` - Список товарів
- `POST /products/parse_one/{product_id}` - Спарсити один товар
- `POST /products/parse_all` - Спарсити всі товари

### Налаштування
- `GET /settings/keys` - Список API ключів
- `POST /settings/add_key` - Додати API ключ
- `POST /settings/activate_key/{key_id}` - Активувати ключ
- `DELETE /settings/delete_key/{key_id}` - Видалити ключ

