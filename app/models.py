from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class Product(BaseModel):
    id: str
    name: str
    url: str
    status: str = "pending"  # pending, parsed, error, disabled_by_competitor
    name_parsed: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[float] = None
    availability: Optional[str] = None
    history: List[dict] = []
    created_at: str
    last_parsed_at: Optional[str] = None
    competitor_name: Optional[str] = None
    category_path: List[str] = []
    parsing_rules: Optional[dict] = None
    logs: List[dict] = []


class ProductAdd(BaseModel):
    name: str
    url: str


class TokenUsage(BaseModel):
    """Запис про використання токенів"""
    timestamp: str  # ISO формат дати
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class APIKey(BaseModel):
    id: str
    name: str
    key: str
    active: bool = False
    token_usage_history: List[TokenUsage] = []  # Історія використання токенів


class APIKeyAdd(BaseModel):
    name: str
    key: str


class Settings(BaseModel):
    keys: List[APIKey] = []
    current_key: Optional[str] = None


class ParseResult(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None


class Category(BaseModel):
    """Категорія конкурента"""
    id: str
    name: str
    url: str
    children: List['Category'] = []

    class Config:
        from_attributes = True


# Для рекурсивних моделей потрібно оновити після визначення
Category.model_rebuild()


class Competitor(BaseModel):
    """Конкурент"""
    id: str
    name: str
    url: str
    categories: List[Category] = []
    last_parsed: Optional[str] = None
    notes: str = ""
    active: bool = True


class CompetitorAdd(BaseModel):
    """Модель для додавання конкурента"""
    name: str
    url: str
    notes: Optional[str] = ""


class DiscoverProductsRequest(BaseModel):
    """Модель для запиту на пошук товарів у категоріях"""
    competitor_id: str
    category_ids: List[str]


# ========== МОДЕЛІ ДЛЯ ХАРАКТЕРИСТИК ==========

class CharacteristicGroup(BaseModel):
    """Група характеристик"""
    id: str
    name: str
    description: Optional[str] = ""
    priority: int = 2  # 1 - найвищий, 2 - середній, 3 - найнижчий
    category_path: List[str] = []  # Категорії товарів, до яких прив'язана група
    created_at: str
    updated_at: str


class Characteristic(BaseModel):
    """Характеристика товару"""
    id: str
    name: str
    type: str  # "text", "number", "choice", "variation", "brand"
    priority: int = 2  # 1 - найвищий, 2 - середній, 3 - найнижчий
    unit: Optional[str] = None  # Одиниця виміру (тільки для числових)
    category_path: List[str] = []  # Категорії товарів, до яких прив'язана характеристика
    group_id: Optional[str] = None  # ID групи характеристик
    photo_url: Optional[str] = None  # URL фото для характеристик типу "Колір", "Бренд"
    choices: List[str] = []  # Варіанти для характеристик типу "choice" та "variation" (рядки)
    brand_choices: List[dict] = []  # Варіанти для характеристик типу "brand" (об'єкти {name, photo_url})
    created_at: str
    updated_at: str


class CharacteristicValue(BaseModel):
    """Значення характеристики для конкретного товару"""
    characteristic_id: str
    value: Optional[str] = None  # Текстове або числове значення
    photo_url: Optional[str] = None  # Фото для характеристик типу "Колір"


class ProductCharacteristics(BaseModel):
    """Характеристики конкретного товару"""
    product_id: str
    characteristics: List[CharacteristicValue] = []


class CharacteristicGroupAdd(BaseModel):
    """Модель для додавання групи характеристик"""
    name: str
    description: Optional[str] = ""
    priority: int = 2  # 1 - найвищий, 2 - середній, 3 - найнижчий
    category_path: List[str] = []


class CharacteristicAdd(BaseModel):
    """Модель для додавання характеристики"""
    name: str
    type: str  # "text", "number", "choice", "variation", "brand"
    priority: int = 2
    unit: Optional[str] = None
    category_path: List[str] = []
    group_id: Optional[str] = None
    photo_url: Optional[str] = None
    choices: List[str] = []  # Варіанти для характеристик типу "choice" та "variation" (рядки)
    brand_choices: List[dict] = []  # Варіанти для характеристик типу "brand" (об'єкти {name, photo_url})


class CharacteristicValueAdd(BaseModel):
    """Модель для додавання значення характеристики до товару"""
    characteristic_id: str
    value: Optional[str] = None
    photo_url: Optional[str] = None