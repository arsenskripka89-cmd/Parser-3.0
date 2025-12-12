// Глобальні змінні
let allProducts = [];
let filteredProducts = [];
let competitors = [];
let categories = [];
// currentTaskId визначено в tasks.js, не дублюємо тут
let selectedCategoryIds = []; // Вибрані категорії для фільтра

// Завантаження списку товарів з фільтрами
async function loadProducts(filters = {}) {
    // Оголошуємо tbody один раз на початку функції
    let tbody = document.getElementById('productsTableBody');
    
    try {
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-500">Завантаження...</td></tr>';
        }
        
        // Формуємо URL з параметрами фільтрів
        const params = new URLSearchParams();
        if (filters.name) params.append('name', filters.name);
        if (filters.competitor_id && filters.competitor_id !== 'all') params.append('competitor_id', filters.competitor_id);
        if (filters.category_ids && filters.category_ids.length > 0) {
            filters.category_ids.forEach(id => params.append('category_ids', id));
        }
        if (filters.status) params.append('status', filters.status);
        if (filters.availability) params.append('availability', filters.availability);
        if (filters.price_from) params.append('price_from', filters.price_from);
        if (filters.price_to) params.append('price_to', filters.price_to);
        if (filters.problematic) params.append('problematic', 'true');
        
        const url = `/products/list?${params.toString()}`;
        console.log('Запит до:', url);
        
        // Додаємо таймаут для запиту (30 секунд)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(url, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log('Відповідь отримано, status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Помилка відповіді:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Дані отримано, товарів:', data.products?.length || 0);
        
        allProducts = data.products || [];
        filteredProducts = data.products || [];
        
        // Перевіряємо, чи tbody все ще існує перед відображенням
        if (!tbody) {
            tbody = document.getElementById('productsTableBody');
        }
        if (tbody) {
            displayProducts(filteredProducts);
            updateParseButtons();
        } else {
            console.error('Елемент productsTableBody не знайдено після завантаження даних!');
        }
    } catch (error) {
        console.error('Помилка завантаження товарів:', error);
        if (!tbody) {
            tbody = document.getElementById('productsTableBody');
        }
        if (tbody) {
            let errorMessage = 'Помилка завантаження';
            if (error.name === 'AbortError') {
                errorMessage = 'Час очікування вичерпано. Спробуйте оновити сторінку.';
            } else if (error.message) {
                errorMessage = 'Помилка: ' + error.message;
            }
            tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-red-500">' + errorMessage + '</td></tr>';
        }
    }
}

// Завантаження конкурентів для фільтрів
async function loadCompetitors() {
    try {
        console.log('Завантаження конкурентів...');
        const response = await fetch('/competitors/list');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        competitors = data.competitors || [];
        console.log('Конкурентів завантажено:', competitors.length);
        
        const select = document.getElementById('filter-competitor');
        if (select) {
            select.innerHTML = '<option value="all">Всі конкуренти</option>';
            competitors.forEach(competitor => {
                const option = document.createElement('option');
                option.value = competitor.id;
                option.textContent = competitor.name;
                select.appendChild(option);
            });
        } else {
            console.error('Select filter-competitor не знайдено!');
        }
    } catch (error) {
        console.error('Помилка завантаження конкурентів:', error);
    }
}

// Завантаження категорій для модального вікна
async function loadCategoriesForModal() {
    try {
        console.log('Завантаження категорій для модального вікна...');
        const response = await fetch('/competitors/list');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        competitors = data.competitors || [];
        
        // Збираємо всі категорії з усіх конкурентів
        const allCategories = [];
        competitors.forEach(competitor => {
            if (competitor.categories && competitor.categories.length > 0) {
                const extractCategories = (cats, parentPath = '', competitorName = '') => {
                    cats.forEach(cat => {
                        const fullPath = parentPath ? `${parentPath} > ${cat.name}` : cat.name;
                        allCategories.push({
                            id: cat.id,
                            name: cat.name,
                            fullPath: fullPath,
                            competitor_id: competitor.id,
                            competitor_name: competitor.name,
                            children: cat.children || []
                        });
                        if (cat.children && cat.children.length > 0) {
                            extractCategories(cat.children, fullPath, competitor.name);
                        }
                    });
                };
                extractCategories(competitor.categories, '', competitor.name);
            }
        });
        
        categories = allCategories;
        console.log('Категорій завантажено:', categories.length);
        renderCategoriesTree();
    } catch (error) {
        console.error('Помилка завантаження категорій:', error);
    }
}

// Відображення дерева категорій у модальному вікні
function renderCategoriesTree() {
    const treeContainer = document.getElementById('categories-tree');
    if (!treeContainer) return;
    
    // Групуємо категорії по конкурентах
    const categoriesByCompetitor = {};
    competitors.forEach(competitor => {
        if (competitor.categories && competitor.categories.length > 0) {
            categoriesByCompetitor[competitor.id] = {
                name: competitor.name,
                categories: competitor.categories
            };
        }
    });
    
    let html = '';
    Object.keys(categoriesByCompetitor).forEach(competitorId => {
        const competitor = categoriesByCompetitor[competitorId];
        html += `<div class="mb-4">`;
        html += `<div class="font-semibold text-gray-800 mb-2">${competitor.name}</div>`;
        html += renderCategoryLevel(competitor.categories, 0);
        html += `</div>`;
    });
    
    treeContainer.innerHTML = html || '<div class="text-gray-500 text-center py-4">Немає категорій</div>';
    
    // Додаємо обробники для розгортання/згортання
    document.querySelectorAll('.category-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const categoryId = this.dataset.categoryId;
            const children = document.getElementById(`category-children-${categoryId}`);
            if (children) {
                children.classList.toggle('hidden');
                const icon = this.querySelector('svg');
                if (icon) {
                    icon.classList.toggle('rotate-90');
                }
            }
        });
    });
    
    // Додаємо обробники для checkbox
    document.querySelectorAll('.category-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const categoryId = this.dataset.categoryId;
            handleCategoryCheckboxChange(categoryId, this.checked);
        });
    });
    
    // Додаємо обробники для кнопок очищення фільтрів (якщо вони є)
    document.querySelectorAll('.clear-filter-btn').forEach(btn => {
        // Перевіряємо, чи обробник вже додано
        if (!btn.hasAttribute('data-listener-added')) {
            btn.setAttribute('data-listener-added', 'true');
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const filterName = this.dataset.filter;
                if (filterName) {
                    clearFilter(filterName);
                }
            });
        }
    });
}

// Функція для пошуку всіх підкатегорій (рекурсивно)
function getAllSubcategoryIds(categoryId) {
    const subcategoryIds = [];
    
    function findCategoryById(cats, targetId) {
        for (const cat of cats) {
            if (cat.id === targetId) {
                return cat;
            }
            if (cat.children && cat.children.length > 0) {
                const found = findCategoryById(cat.children, targetId);
                if (found) return found;
            }
        }
        return null;
    }
    
    function collectSubcategoryIds(category) {
        if (category.children && category.children.length > 0) {
            category.children.forEach(child => {
                subcategoryIds.push(child.id);
                collectSubcategoryIds(child);
            });
        }
    }
    
    // Шукаємо категорію в усіх конкурентах
    for (const competitor of competitors) {
        if (competitor.categories && competitor.categories.length > 0) {
            const category = findCategoryById(competitor.categories, categoryId);
            if (category) {
                collectSubcategoryIds(category);
                break;
            }
        }
    }
    
    return subcategoryIds;
}

// Функція для пошуку батьківської категорії
function getParentCategoryId(categoryId) {
    function findParent(cats, targetId, parentId = null) {
        for (const cat of cats) {
            if (cat.id === targetId) {
                return parentId;
            }
            if (cat.children && cat.children.length > 0) {
                const found = findParent(cat.children, targetId, cat.id);
                if (found !== null) return found;
            }
        }
        return null;
    }
    
    for (const competitor of competitors) {
        if (competitor.categories && competitor.categories.length > 0) {
            const parentId = findParent(competitor.categories, categoryId);
            if (parentId !== null) return parentId;
        }
    }
    return null;
}

// Перевірка, чи всі підкатегорії вибрані
function areAllSubcategoriesSelected(categoryId) {
    const subcategoryIds = getAllSubcategoryIds(categoryId);
    if (subcategoryIds.length === 0) return true; // Немає підкатегорій
    
    return subcategoryIds.every(subId => selectedCategoryIds.includes(subId));
}

// Оновлення стану батьківської категорії
function updateParentCategoryState(categoryId) {
    const parentId = getParentCategoryId(categoryId);
    if (!parentId) return; // Немає батьківської категорії
    
    const allSelected = areAllSubcategoriesSelected(parentId);
    const parentCheckbox = document.querySelector(`.category-checkbox[data-category-id="${parentId}"]`);
    
    if (parentCheckbox) {
        if (allSelected) {
            // Всі підкатегорії вибрані - проставляємо галочку в батьківській
            if (!parentCheckbox.checked) {
                parentCheckbox.checked = true;
            }
            if (!selectedCategoryIds.includes(parentId)) {
                selectedCategoryIds.push(parentId);
            }
        } else {
            // Не всі підкатегорії вибрані - знімаємо галочку з батьківської
            if (parentCheckbox.checked) {
                parentCheckbox.checked = false;
            }
            selectedCategoryIds = selectedCategoryIds.filter(id => id !== parentId);
        }
        
        // Рекурсивно оновлюємо батьківську категорію батьківської
        updateParentCategoryState(parentId);
    }
}

// Обробка зміни checkbox категорії
function handleCategoryCheckboxChange(categoryId, isChecked) {
    // Оновлюємо обрану категорію
    if (isChecked) {
        if (!selectedCategoryIds.includes(categoryId)) {
            selectedCategoryIds.push(categoryId);
        }
    } else {
        selectedCategoryIds = selectedCategoryIds.filter(id => id !== categoryId);
    }
    
    // Отримуємо всі підкатегорії
    const subcategoryIds = getAllSubcategoryIds(categoryId);
    
    // Оновлюємо підкатегорії (якщо це головна категорія)
    subcategoryIds.forEach(subId => {
        if (isChecked) {
            // Додаємо підкатегорію до вибраних
            if (!selectedCategoryIds.includes(subId)) {
                selectedCategoryIds.push(subId);
            }
            // Проставляємо галочку в UI
            const subCheckbox = document.querySelector(`.category-checkbox[data-category-id="${subId}"]`);
            if (subCheckbox && !subCheckbox.checked) {
                subCheckbox.checked = true;
            }
        } else {
            // Видаляємо підкатегорію з вибраних
            selectedCategoryIds = selectedCategoryIds.filter(id => id !== subId);
            // Знімаємо галочку в UI
            const subCheckbox = document.querySelector(`.category-checkbox[data-category-id="${subId}"]`);
            if (subCheckbox && subCheckbox.checked) {
                subCheckbox.checked = false;
            }
        }
    });
    
    // Оновлюємо стан батьківської категорії (якщо це підкатегорія)
    updateParentCategoryState(categoryId);
}

// Рекурсивне відображення рівня категорій
function renderCategoryLevel(categories, level = 0) {
    if (!categories || categories.length === 0) return '';
    
    let html = '';
    categories.forEach(category => {
        const hasChildren = category.children && category.children.length > 0;
        const indent = level * 20;
        const isChecked = selectedCategoryIds.includes(category.id);
        
        html += `<div class="mb-1" style="padding-left: ${indent}px;">`;
        html += `<label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">`;
        
        if (hasChildren) {
            html += `<button type="button" class="category-toggle flex items-center" data-category-id="${category.id}">`;
            html += `<svg class="w-4 h-4 text-gray-500 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">`;
            html += `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>`;
            html += `</svg>`;
            html += `</button>`;
        } else {
            html += `<span class="w-4"></span>`;
        }
        
        html += `<input type="checkbox" class="category-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" 
                       data-category-id="${category.id}" ${isChecked ? 'checked' : ''}>`;
        html += `<span class="text-sm text-gray-700">${category.name}</span>`;
        html += `</label>`;
        
        if (hasChildren) {
            html += `<div id="category-children-${category.id}" class="hidden ml-4">`;
            html += renderCategoryLevel(category.children, level + 1);
            html += `</div>`;
        }
        
        html += `</div>`;
    });
    
    return html;
}

// Функція для пошуку конкурента за категорією (асинхронна)
async function findCompetitorByCategory(categoryPath) {
    if (!categoryPath || categoryPath.length === 0) {
        return null;
    }
    
    try {
        const categoryPathParams = categoryPath.map(cat => `category_path=${encodeURIComponent(cat)}`).join('&');
        const response = await fetch(`/competitors/by_category?${categoryPathParams}`);
        if (response.ok) {
            const competitor = await response.json();
            if (competitor && competitor.id) {
                return competitor;
            }
        }
    } catch (error) {
        console.error('Помилка пошуку конкурента за категорією:', error);
    }
    return null;
}

// Функція для отримання конкурента (з кешуванням)
const competitorCache = new Map();
async function getCompetitorForProduct(product) {
    // Спочатку перевіряємо competitor_id
    if (product.competitor_id) {
        const cacheKey = `id_${product.competitor_id}`;
        if (competitorCache.has(cacheKey)) {
            return competitorCache.get(cacheKey);
        }
        
        try {
            const response = await fetch(`/competitors/${product.competitor_id}`);
            if (response.ok) {
                const competitor = await response.json();
                competitorCache.set(cacheKey, competitor);
                return competitor;
            }
        } catch (error) {
            console.error('Помилка отримання конкурента:', error);
        }
    }
    
    // Якщо немає competitor_id, шукаємо за категорією
    if (product.category_path && product.category_path.length > 0) {
        const cacheKey = `cat_${product.category_path.join('|')}`;
        if (competitorCache.has(cacheKey)) {
            return competitorCache.get(cacheKey);
        }
        
        const competitor = await findCompetitorByCategory(product.category_path);
        if (competitor) {
            competitorCache.set(cacheKey, competitor);
            return competitor;
        }
    }
    
    // Якщо немає категорії, шукаємо за назвою
    if (product.competitor_name) {
        const cacheKey = `name_${product.competitor_name}`;
        if (competitorCache.has(cacheKey)) {
            return competitorCache.get(cacheKey);
        }
        
        try {
            const response = await fetch(`/competitors/by_name/${encodeURIComponent(product.competitor_name)}`);
            if (response.ok) {
                const competitor = await response.json();
                if (competitor) {
                    competitorCache.set(cacheKey, competitor);
                    return competitor;
                }
            }
        } catch (error) {
            console.error('Помилка пошуку конкурента за назвою:', error);
        }
    }
    
    return null;
}

// Функція для рендерингу breadcrumb категорій
async function renderCategoryBreadcrumbForList(categoryPath, competitorId, categories) {
    if (!categoryPath || categoryPath.length === 0) {
        return '-';
    }
    
    // Рекурсивна функція для пошуку категорії за назвою
    function findCategoryByName(cats, name, parentPath = []) {
        const searchName = name.toLowerCase().trim();
        
        // Пропускаємо "Головна" - це не реальна категорія
        if (searchName === 'головна' || searchName === 'главная' || searchName === 'home') {
            return null;
        }
        
        for (const cat of cats) {
            const catName = cat.name.toLowerCase().trim();
            
            // Точний збіг
            if (catName === searchName) {
                return { category: cat, path: parentPath };
            }
            
            // Частковий збіг
            if (catName.includes(searchName) || searchName.includes(catName)) {
                return { category: cat, path: parentPath };
            }
            
            // Рекурсивний пошук у дочірніх категоріях
            if (cat.children && cat.children.length > 0) {
                const found = findCategoryByName(cat.children, name, [...parentPath, cat]);
                if (found) return found;
            }
        }
        return null;
    }
    
    let breadcrumbHtml = '';
    let parentCategories = categories;
    let currentPath = [];
    
    for (let i = 0; i < categoryPath.length; i++) {
        const catName = categoryPath[i];
        const searchName = catName.toLowerCase().trim();
        
        // Пропускаємо "Головна" - показуємо як текст без посилання
        if (searchName === 'головна' || searchName === 'главная' || searchName === 'home') {
            if (i === categoryPath.length - 1) {
                breadcrumbHtml += `<span class="text-gray-800 font-medium text-sm">${escapeHtml(catName)}</span>`;
            } else {
                breadcrumbHtml += `<span class="text-gray-600 text-sm">${escapeHtml(catName)}</span> / `;
            }
            continue;
        }
        
        const result = findCategoryByName(parentCategories, catName, currentPath);
        
        if (result && result.category && competitorId) {
            const category = result.category;
            // Всі категорії (включаючи останню) мають посилання
            if (i === categoryPath.length - 1) {
                breadcrumbHtml += `<a href="/competitors/${competitorId}/category/${category.id}" class="text-blue-600 hover:underline font-medium text-sm">${escapeHtml(catName)}</a>`;
            } else {
                breadcrumbHtml += `<a href="/competitors/${competitorId}/category/${category.id}" class="text-blue-600 hover:underline text-sm">${escapeHtml(catName)}</a> / `;
            }
            parentCategories = category.children || [];
            currentPath = [...currentPath, category];
        } else {
            // Якщо категорію не знайдено, показуємо без посилання
            if (i === categoryPath.length - 1) {
                breadcrumbHtml += `<span class="text-gray-800 font-medium text-sm">${escapeHtml(catName)}</span>`;
            } else {
                breadcrumbHtml += `<span class="text-gray-600 text-sm">${escapeHtml(catName)}</span> / `;
            }
        }
    }
    
    return breadcrumbHtml || categoryPath.join(' / ');
}

// Екранування HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Відображення товарів у таблиці
async function displayProducts(products) {
    const tbody = document.getElementById('productsTableBody');
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-500">Немає товарів. Додайте перший товар.</td></tr>';
        return;
    }
    
    // Спочатку показуємо товари без конкурентів та категорій
    tbody.innerHTML = products.map(product => {
        const price = product.price ? `${product.price} грн` : '-';
        const availability = product.availability || '-';
        
        // Статус бейдж (CRM-стиль, приглушені кольори)
        let statusBadge = '';
        if (product.status === 'parsed') {
            statusBadge = '<span class="bg-green-100 text-green-700 rounded-md px-2 py-1 text-sm font-medium">Спарсено</span>';
        } else if (product.status === 'error') {
            statusBadge = '<span class="bg-red-100 text-red-700 rounded-md px-2 py-1 text-sm font-medium">Помилка</span>';
        } else if (product.status === 'disabled_by_competitor') {
            statusBadge = '<span class="bg-orange-100 text-orange-700 rounded-md px-2 py-1 text-sm font-medium">Вимкнений конкурентом</span>';
        } else {
            statusBadge = '<span class="bg-gray-100 text-gray-600 rounded-md px-2 py-1 text-sm font-medium">Очікує</span>';
        }
        
        // Додаємо класи для затемнення рядка, якщо статус "error" або "disabled_by_competitor"
        const rowClasses = product.status === 'error' 
            ? 'border-b border-gray-200 hover:bg-gray-50 transition opacity-50 bg-gray-50' 
            : product.status === 'disabled_by_competitor'
            ? 'border-b border-gray-200 hover:bg-gray-50 transition opacity-60 bg-orange-50'
            : 'border-b border-gray-200 hover:bg-gray-50 transition';
        
        return `
            <tr class="${rowClasses}" data-product-id="${product.id}">
                <td class="px-4 py-3">
                    <input type="checkbox" class="product-checkbox" data-id="${product.id}" 
                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                </td>
                <td class="px-4 py-3"><a href="/product/${product.id}" class="text-blue-600 hover:underline font-medium text-[#1f2937]">${product.name || product.name_parsed || 'Без назви'}</a></td>
                <td class="px-4 py-3 competitor-cell" data-product-id="${product.id}">Завантаження...</td>
                <td class="px-4 py-3 category-cell" data-product-id="${product.id}">Завантаження...</td>
                <td class="px-4 py-3"><a href="${product.url}" target="_blank" class="text-blue-600 hover:underline text-sm text-gray-700">${product.url}</a></td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3 text-[#1f2937]">${price}</td>
                <td class="px-4 py-3 text-gray-600">${availability}</td>
                <td class="px-4 py-3">
                    <button class="parse-product-btn bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1 shadow-sm text-sm font-medium transition" 
                            data-id="${product.id}" onclick="parseProduct('${product.id}')">
                        Спарсити
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Додаємо обробники для checkbox
    document.querySelectorAll('.product-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedButtons);
    });
    
    // Асинхронно завантажуємо конкурентів та категорії для кожного товару
    for (const product of products) {
        try {
            const competitor = await getCompetitorForProduct(product);
            const competitorCell = document.querySelector(`.competitor-cell[data-product-id="${product.id}"]`);
            const categoryCell = document.querySelector(`.category-cell[data-product-id="${product.id}"]`);
            
            if (competitor && competitor.id) {
                // Відображаємо конкурента
                if (competitorCell) {
                    competitorCell.innerHTML = `<a href="/competitor/${competitor.id}" class="text-blue-600 hover:underline font-medium text-sm">${escapeHtml(competitor.name)}</a>`;
                }
                
                // Отримуємо категорії конкурента для breadcrumb
                try {
                    const competitorResponse = await fetch(`/competitors/${competitor.id}`);
                    if (competitorResponse.ok) {
                        const competitorFull = await competitorResponse.json();
                        const categories = competitorFull.categories || [];
                        const categoryBreadcrumb = await renderCategoryBreadcrumbForList(
                            product.category_path || [],
                            competitor.id,
                            categories
                        );
                        if (categoryCell) {
                            categoryCell.innerHTML = categoryBreadcrumb;
                        }
                    }
                } catch (error) {
                    console.error('Помилка отримання категорій конкурента:', error);
                    if (categoryCell && product.category_path && product.category_path.length > 0) {
                        categoryCell.innerHTML = product.category_path.join(' / ');
                    } else if (categoryCell) {
                        categoryCell.textContent = '-';
                    }
                }
            } else {
                // Конкурент не знайдено - спробуємо знайти за назвою, навіть якщо вона повна
                if (product.competitor_name) {
                    // Спробуємо знайти конкурента за назвою, навіть якщо вона повна
                    try {
                        const competitorResponse = await fetch(`/competitors/by_name/${encodeURIComponent(product.competitor_name)}`);
                        if (competitorResponse.ok) {
                            const competitor = await competitorResponse.json();
                            if (competitor && competitor.id) {
                                // Знайдено конкурента - відображаємо коротку назву з бази даних
                                if (competitorCell) {
                                    competitorCell.innerHTML = `<a href="/competitor/${competitor.id}" class="text-blue-600 hover:underline font-medium text-sm">${escapeHtml(competitor.name)}</a>`;
                                }
                                
                                // Отримуємо категорії конкурента для breadcrumb
                                try {
                                    const competitorFullResponse = await fetch(`/competitors/${competitor.id}`);
                                    if (competitorFullResponse.ok) {
                                        const competitorFull = await competitorFullResponse.json();
                                        const categories = competitorFull.categories || [];
                                        const categoryBreadcrumb = await renderCategoryBreadcrumbForList(
                                            product.category_path || [],
                                            competitor.id,
                                            categories
                                        );
                                        if (categoryCell) {
                                            categoryCell.innerHTML = categoryBreadcrumb;
                                        }
                                    }
                                } catch (error) {
                                    console.error('Помилка отримання категорій конкурента:', error);
                                    if (categoryCell && product.category_path && product.category_path.length > 0) {
                                        categoryCell.innerHTML = product.category_path.join(' / ');
                                    } else if (categoryCell) {
                                        categoryCell.textContent = '-';
                                    }
                                }
                            } else {
                                // Конкурент не знайдено за назвою
                                if (competitorCell) {
                                    competitorCell.textContent = '-';
                                }
                                if (categoryCell) {
                                    if (product.category_path && product.category_path.length > 0) {
                                        categoryCell.innerHTML = product.category_path.join(' / ');
                                    } else {
                                        categoryCell.textContent = '-';
                                    }
                                }
                            }
                        } else {
                            // Помилка пошуку
                            if (competitorCell) {
                                competitorCell.textContent = '-';
                            }
                            if (categoryCell) {
                                if (product.category_path && product.category_path.length > 0) {
                                    categoryCell.innerHTML = product.category_path.join(' / ');
                                } else {
                                    categoryCell.textContent = '-';
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Помилка пошуку конкурента за назвою:', error);
                        if (competitorCell) {
                            competitorCell.textContent = '-';
                        }
                        if (categoryCell) {
                            if (product.category_path && product.category_path.length > 0) {
                                categoryCell.innerHTML = product.category_path.join(' / ');
                            } else {
                                categoryCell.textContent = '-';
                            }
                        }
                    }
                } else {
                    // Немає назви конкурента
                    if (competitorCell) {
                        competitorCell.textContent = '-';
                    }
                    if (categoryCell) {
                        if (product.category_path && product.category_path.length > 0) {
                            categoryCell.innerHTML = product.category_path.join(' / ');
                        } else {
                            categoryCell.textContent = '-';
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Помилка завантаження даних для товару ${product.id}:`, error);
            const competitorCell = document.querySelector(`.competitor-cell[data-product-id="${product.id}"]`);
            const categoryCell = document.querySelector(`.category-cell[data-product-id="${product.id}"]`);
            if (competitorCell) competitorCell.textContent = product.competitor_name || '-';
            if (categoryCell) {
                if (product.category_path && product.category_path.length > 0) {
                    categoryCell.textContent = product.category_path.join(' / ');
                } else {
                    categoryCell.textContent = '-';
                }
            }
        }
    }
}

// Оновлення кнопок "Парсити знайдене" та "Парсити вибране"
function updateParseButtons() {
    const parseFoundBtn = document.getElementById('parse-found-btn');
    const parseSelectedBtn = document.getElementById('parse-selected-btn');
    
    // Показуємо "Парсити знайдене", якщо є відфільтровані товари
    if (filteredProducts.length > 0) {
        parseFoundBtn.classList.remove('hidden');
    } else {
        parseFoundBtn.classList.add('hidden');
    }
    
    // Показуємо "Парсити вибране", якщо є вибрані товари
    const selectedCount = document.querySelectorAll('.product-checkbox:checked').length;
    if (selectedCount > 0) {
        parseSelectedBtn.classList.remove('hidden');
    } else {
        parseSelectedBtn.classList.add('hidden');
    }
}

// Оновлення кнопки "Парсити вибране" при зміні checkbox
function updateSelectedButtons() {
    const parseSelectedBtn = document.getElementById('parse-selected-btn');
    const selectedCount = document.querySelectorAll('.product-checkbox:checked').length;
    
    if (selectedCount > 0) {
        parseSelectedBtn.classList.remove('hidden');
    } else {
        parseSelectedBtn.classList.add('hidden');
    }
}

// Отримання поточних фільтрів
function getCurrentFilters() {
    return {
        name: document.getElementById('filter-name').value.trim(),
        competitor_id: document.getElementById('filter-competitor').value,
        category_ids: selectedCategoryIds,
        status: document.getElementById('filter-status').value,
        availability: document.getElementById('filter-availability').value,
        price_from: document.getElementById('filter-price-from').value,
        price_to: document.getElementById('filter-price-to').value,
        problematic: document.getElementById('filter-problematic').checked
    };
}

// Застосування фільтрів
function applyFilters() {
    const filters = getCurrentFilters();
    loadProducts(filters);
}

// Очищення конкретного фільтру
function clearFilter(filterName) {
    switch(filterName) {
        case 'name':
            document.getElementById('filter-name').value = '';
            break;
        case 'competitor':
            document.getElementById('filter-competitor').value = 'all';
            break;
        case 'categories':
            selectedCategoryIds = [];
            document.getElementById('categories-selected-text').textContent = 'Обрати категорії';
            // Знімаємо всі галочки в модальному вікні категорій
            document.querySelectorAll('.category-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            break;
        case 'status':
            document.getElementById('filter-status').value = '';
            break;
        case 'availability':
            document.getElementById('filter-availability').value = '';
            break;
        case 'price-from':
            document.getElementById('filter-price-from').value = '';
            break;
        case 'price-to':
            document.getElementById('filter-price-to').value = '';
            break;
        case 'problematic':
            document.getElementById('filter-problematic').checked = false;
            break;
    }
}

// Скидання всіх фільтрів
function resetAllFilters() {
    document.getElementById('filter-name').value = '';
    document.getElementById('filter-competitor').value = 'all';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-availability').value = '';
    document.getElementById('filter-price-from').value = '';
    document.getElementById('filter-price-to').value = '';
    document.getElementById('filter-problematic').checked = false;
    
    // Очищаємо категорії
    selectedCategoryIds = [];
    document.getElementById('categories-selected-text').textContent = 'Обрати категорії';
    document.querySelectorAll('.category-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Завантажуємо товари без фільтрів
    loadProducts({});
}

// Парсинг одного товару (використовуємо фонову задачу)
async function parseProduct(productId) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Запуск...';
    
    try {
        // Створюємо фонову задачу
        await createParseProductTask(productId);
        btn.textContent = 'В процесі…';
    } catch (error) {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Помилка запуску парсингу: ' + error.message);
    }
}

// Парсинг всіх товарів (використовуємо фонову задачу)
async function parseAll() {
    const btn = document.getElementById('parseAllBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Запуск...';
    
    try {
        // Створюємо фонову задачу
        await createParseAllTask();
        btn.textContent = 'В процесі…';
    } catch (error) {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Помилка запуску парсингу: ' + error.message);
    }
}

// Парсинг знайдених товарів (відфільтровані)
async function parseFound() {
    const btn = document.getElementById('parse-found-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Запуск...';
    
    try {
        const filters = getCurrentFilters();
        const response = await fetch('/tasks/parse_filtered', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filters })
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        // currentTaskId визначено в tasks.js
        if (typeof currentTaskId !== 'undefined') {
            currentTaskId = data.task_id;
        }
        
        // Показуємо прогрес-бар
        showTaskProgress('Парсинг знайдених товарів...');
        startPolling(data.task_id);
        
        // Блокуємо UI
        setParsingActive(true);
        
        btn.textContent = 'В процесі…';
    } catch (error) {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Помилка запуску парсингу: ' + error.message);
    }
}

// Парсинг вибраних товарів
async function parseSelected() {
    const btn = document.getElementById('parse-selected-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Запуск...';
    
    try {
        const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked'))
            .map(cb => cb.dataset.id);
        
        if (selectedIds.length === 0) {
            alert('Виберіть хоча б один товар');
            btn.textContent = originalText;
            btn.disabled = false;
            return;
        }
        
        const response = await fetch('/tasks/parse_selected', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: selectedIds })
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        // currentTaskId визначено в tasks.js
        if (typeof currentTaskId !== 'undefined') {
            currentTaskId = data.task_id;
        }
        
        // Показуємо прогрес-бар
        showTaskProgress('Парсинг вибраних товарів...');
        startPolling(data.task_id);
        
        // Блокуємо UI
        setParsingActive(true);
        
        btn.textContent = 'В процесі…';
    } catch (error) {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Помилка запуску парсингу: ' + error.message);
    }
}

// Обробка "Вибрати все"
function handleSelectAll() {
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.product-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateSelectedButtons();
}

// Показ/приховування панелі фільтрів
function toggleFiltersPanel() {
    console.log('toggleFiltersPanel викликано');
    const panel = document.getElementById('filters-panel');
    if (!panel) {
        console.error('Панель фільтрів не знайдена!');
        alert('Помилка: панель фільтрів не знайдена. Перезавантажте сторінку.');
        return;
    }
    const wasHidden = panel.classList.contains('hidden');
    console.log('Поточний стан панелі:', wasHidden ? 'прихована' : 'видима');
    panel.classList.toggle('hidden');
    const isNowHidden = panel.classList.contains('hidden');
    console.log('Новий стан панелі:', isNowHidden ? 'прихована' : 'видима');
    if (wasHidden === isNowHidden) {
        console.warn('Увага: стан панелі не змінився!');
    }
}

// Глобальна функція для відкриття модального вікна додавання товару
function openAddProductModal() {
    console.log('openAddProductModal викликано');
    const modal = document.getElementById('addProductModal');
    if (!modal) {
        console.error('Модальне вікно addProductModal не знайдено!');
        alert('Помилка: модальне вікно не знайдено. Перезавантажте сторінку.');
        return;
    }
    console.log('Відкриття модального вікна, поточний display:', modal.style.display);
    modal.style.display = 'block';
    console.log('Модальне вікно відкрито, новий display:', modal.style.display);
}

// Закриття панелі фільтрів
function closeFiltersPanel() {
    const panel = document.getElementById('filters-panel');
    panel.classList.add('hidden');
}

// Відкриття модального вікна вибору категорій
function openCategoriesModal() {
    const modal = document.getElementById('categoriesModal');
    modal.style.display = 'block';
    // Оновлюємо стан checkbox при відкритті
    document.querySelectorAll('.category-checkbox').forEach(checkbox => {
        const categoryId = checkbox.dataset.categoryId;
        checkbox.checked = selectedCategoryIds.includes(categoryId);
    });
}

// Закриття модального вікна вибору категорій
function closeCategoriesModal() {
    const modal = document.getElementById('categoriesModal');
    modal.style.display = 'none';
}

// Застосування вибраних категорій
function applySelectedCategories() {
    // Оновлюємо selectedCategoryIds з checkbox
    selectedCategoryIds = [];
    document.querySelectorAll('.category-checkbox:checked').forEach(checkbox => {
        selectedCategoryIds.push(checkbox.dataset.categoryId);
    });
    
    // Оновлюємо текст кнопки
    const btn = document.getElementById('select-categories-btn');
    const textSpan = document.getElementById('categories-selected-text');
    if (selectedCategoryIds.length > 0) {
        textSpan.textContent = `${selectedCategoryIds.length} категорії вибрано`;
    } else {
        textSpan.textContent = 'Обрати категорії';
    }
    
    closeCategoriesModal();
}

// Завантаження при старті
// Використовуємо кілька способів для надійності
function initApp() {
    console.log('=== Ініціалізація додатку... ===');
    
    // Перевіряємо наявність ключових елементів
    const addBtn = document.getElementById('addProductBtn');
    const toggleBtn = document.getElementById('toggle-filters-btn');
    const modal = document.getElementById('addProductModal');
    const panel = document.getElementById('filters-panel');
    
    console.log('Перевірка елементів:', {
        addBtn: !!addBtn,
        toggleBtn: !!toggleBtn,
        modal: !!modal,
        panel: !!panel
    });
    
    if (!addBtn) {
        console.error('КРИТИЧНО: addProductBtn не знайдено!');
        return false;
    }
    if (!toggleBtn) {
        console.error('КРИТИЧНО: toggle-filters-btn не знайдено!');
        return false;
    }
    if (!modal) {
        console.error('КРИТИЧНО: addProductModal не знайдено!');
        return false;
    }
    if (!panel) {
        console.error('КРИТИЧНО: filters-panel не знайдено!');
        return false;
    }
    
    return true;
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('=== DOM завантажено, ініціалізація... ===');
    
    // Чекаємо трохи, щоб переконатися, що всі елементи завантажені
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!initApp()) {
        console.error('Помилка ініціалізації - не всі елементи знайдено');
        // Спробуємо ще раз через секунду
        setTimeout(() => {
            if (!initApp()) {
                alert('Помилка завантаження сторінки. Перезавантажте сторінку.');
            }
        }, 1000);
        return;
    }
    
    // Завантажуємо конкурентів та категорії
    try {
        await loadCompetitors();
        await loadCategoriesForModal();
    } catch (error) {
        console.error('Помилка завантаження конкурентів/категорій:', error);
    }
    
    // Завантажуємо товари
    console.log('Завантаження товарів...');
    loadProducts();
    
    // Модальне вікно додавання товару (використовуємо змінні з initApp)
    const addProductModal = document.getElementById('addProductModal');
    const addProductBtn = document.getElementById('addProductBtn');
    const closeBtn = document.querySelector('.close');
    const form = document.getElementById('addProductForm');
    
    console.log('Елементи модального вікна:', {modal: !!addProductModal, addBtn: !!addProductBtn, closeBtn: !!closeBtn, form: !!form});
    
    if (addProductBtn) {
        console.log('Додано обробник для addProductBtn');
        // Видаляємо старі обробники, якщо вони є
        const newAddBtn = addProductBtn.cloneNode(true);
        addProductBtn.parentNode.replaceChild(newAddBtn, addProductBtn);
        
        // Додаємо обробники до нового елемента
        newAddBtn.onclick = function(e) {
            console.log('Клік по кнопці Додати товар (onclick)');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openAddProductModal();
            return false;
        };
        newAddBtn.addEventListener('click', function(e) {
            console.log('Клік по кнопці Додати товар (addEventListener)');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openAddProductModal();
            return false;
        }, true);
    } else {
        console.error('Кнопка addProductBtn не знайдена!');
    }
    
    if (closeBtn && addProductModal) {
        closeBtn.onclick = function() {
            addProductModal.style.display = 'none';
        };
    }
    
    // Додавання товару
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Запуск...';
            }

            const formData = new FormData(form);
            const productData = {
                url: formData.get('url')
            };
            
            try {
                const response = await fetch('/products/add', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(productData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showToast('✅ Товар додано. Запускаю парсинг всіх даних…', 'success');
                    form.reset();
                    if (addProductModal) addProductModal.style.display = 'none';
                    
                    // Оновлюємо список, щоб одразу з’явився новий товар
                    applyFilters();
                    
                    // Запускаємо повний парсинг (той самий, що "Парсинг всіх даних" у картці товару)
                    const productId = data.product && data.product.id;
                    if (productId) {
                        await createParseProductFullTask(productId);
                    }
                } else {
                    showToast('❌ Помилка додавання товару', 'error');
                }
            } catch (error) {
                showToast('❌ Помилка: ' + error.message, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }
    
    // Обробка кліку поза модальними вікнами
    window.onclick = function(event) {
        const modal = document.getElementById('addProductModal');
        const categoriesModal = document.getElementById('categoriesModal');
        
        if (event.target == modal) {
            modal.style.display = 'none';
        }
        if (event.target == categoriesModal) {
            closeCategoriesModal();
        }
    };
    
    // Обробники подій для кнопок
    const parseAllBtn = document.getElementById('parseAllBtn');
    if (parseAllBtn) parseAllBtn.addEventListener('click', parseAll);
    
    const parseFoundBtn = document.getElementById('parse-found-btn');
    if (parseFoundBtn) parseFoundBtn.addEventListener('click', parseFound);
    
    const parseSelectedBtn = document.getElementById('parse-selected-btn');
    if (parseSelectedBtn) parseSelectedBtn.addEventListener('click', parseSelected);
    
    const selectAll = document.getElementById('select-all');
    if (selectAll) selectAll.addEventListener('change', handleSelectAll);
    
    // Обробники для панелі фільтрів
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    if (toggleFiltersBtn) {
        console.log('Додано обробник для toggle-filters-btn');
        // Видаляємо старі обробники, якщо вони є
        const newToggleBtn = toggleFiltersBtn.cloneNode(true);
        toggleFiltersBtn.parentNode.replaceChild(newToggleBtn, toggleFiltersBtn);
        
        // Додаємо обробники до нового елемента
        newToggleBtn.onclick = function(e) {
            console.log('Клік по кнопці Фільтри (onclick)');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleFiltersPanel();
            return false;
        };
        newToggleBtn.addEventListener('click', function(e) {
            console.log('Клік по кнопці Фільтри (addEventListener)');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleFiltersPanel();
            return false;
        }, true);
    } else {
        console.error('Кнопка toggle-filters-btn не знайдена!');
    }
    
    const closeFiltersBtn = document.getElementById('close-filters-btn');
    if (closeFiltersBtn) closeFiltersBtn.addEventListener('click', closeFiltersPanel);
    
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
    
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetAllFilters);
    
    // Обробники для кнопок очищення окремих фільтрів
    document.querySelectorAll('.clear-filter-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const filterName = this.dataset.filter;
            if (filterName) {
                clearFilter(filterName);
            }
        });
    });
    
    // Обробники для модального вікна категорій
    const selectCategoriesBtn = document.getElementById('select-categories-btn');
    if (selectCategoriesBtn) selectCategoriesBtn.addEventListener('click', openCategoriesModal);
    
    const closeCategoriesModalBtn = document.getElementById('close-categories-modal');
    if (closeCategoriesModalBtn) closeCategoriesModalBtn.addEventListener('click', closeCategoriesModal);
    
    const cancelCategoriesBtn = document.getElementById('cancel-categories-btn');
    if (cancelCategoriesBtn) cancelCategoriesBtn.addEventListener('click', closeCategoriesModal);
    
    const applyCategoriesBtn = document.getElementById('apply-categories-btn');
    if (applyCategoriesBtn) applyCategoriesBtn.addEventListener('click', applySelectedCategories);
    
    // Перевіряємо статус задачі кожні 2 секунди, якщо є активна задача
    // Використовуємо currentTaskId з tasks.js, якщо він доступний
    setInterval(() => {
        if (typeof currentTaskId !== 'undefined' && currentTaskId) {
            fetch(`/tasks/status/${currentTaskId}`)
                .then(res => res.json())
                .then(status => {
                    if (status.status === 'finished' || status.status === 'failed') {
                        // Оновлюємо таблицю з поточними фільтрами
                        applyFilters();
                        // Скидаємо всі checkbox
                        document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
                        const selectAll = document.getElementById('select-all');
                        if (selectAll) selectAll.checked = false;
                        if (typeof currentTaskId !== 'undefined') {
                            currentTaskId = null;
                        }
                    }
                })
                .catch(err => console.error('Помилка перевірки статусу:', err));
        }
    }, 2000);
});
