// Отримуємо ID конкурента з URL
const urlParts = window.location.pathname.split('/');
const competitorId = urlParts[urlParts.length - 1];

// Завантаження даних конкурента
async function loadCompetitor() {
    try {
        const response = await fetch(`/competitors/${competitorId}`);
        if (!response.ok) {
            throw new Error('Конкурент не знайдено');
        }
        const competitor = await response.json();
        displayCompetitor(competitor);
        displayCategoriesTree(competitor.categories || [], competitorId);
    } catch (error) {
        console.error('Помилка завантаження:', error);
        document.getElementById('competitorName').textContent = 'Помилка завантаження';
    }
}

// Відображення даних конкурента
function displayCompetitor(competitor) {
    document.getElementById('competitorName').textContent = competitor.name;
    const urlLink = document.getElementById('competitorUrl');
    urlLink.href = competitor.url;
    urlLink.textContent = competitor.url;
    
    const lastParsed = competitor.last_parsed 
        ? new Date(competitor.last_parsed).toLocaleString('uk-UA')
        : 'Ніколи';
    document.getElementById('lastParsed').textContent = lastParsed;
    document.getElementById('competitorNotes').textContent = competitor.notes || 'Немає';
}

// Відображення дерева категорій
function displayCategoriesTree(categories, competitorId, level = 0) {
    const container = document.getElementById('categoriesTree');
    
    // Зберігаємо оригінальні категорії для фільтрації (тільки на першому рівні)
    if (level === 0) {
        originalCategories = JSON.parse(JSON.stringify(categories)); // Глибоке копіювання
    }
    
    if (categories.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-center py-8">Категорій немає. Натисніть "Спарсити категорії" для початку.</div>';
        return;
    }
    
    container.innerHTML = renderCategories(categories, competitorId, level);
    
    // Оновлюємо видимість кнопок після рендерингу
    updateDiscoverButton();
}

// Рендеринг категорій (рекурсивно)
function renderCategories(categories, competitorId, level = 0) {
    return categories.map(category => {
        const indent = level * 24;
        const hasChildren = category.children && category.children.length > 0;
        const categoryUrl = `/competitors/${competitorId}/category/${category.id}`;
        const needsManualCheck = category.needs_manual_check === true;
        
        let html = `
            <div class="category-item" style="padding-left: ${indent}px;">
                <div class="flex items-center gap-2 py-2 hover:bg-gray-50 rounded px-2 -ml-2 ${needsManualCheck ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}">
                    <input type="checkbox" class="category-select w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" 
                           data-id="${category.id}" 
                           onchange="updateDiscoverButton()">
                    ${hasChildren ? `
                        <button onclick="toggleCategory('${category.id}')" 
                                class="text-gray-500 hover:text-gray-700 focus:outline-none">
                            <span id="icon-${category.id}" class="inline-block transform transition">▶</span>
                        </button>
                    ` : '<span class="w-4"></span>'}
                    <a href="${categoryUrl}" 
                       class="text-blue-600 hover:underline font-medium flex-1 ${needsManualCheck ? 'text-yellow-700' : ''}">
                        ${escapeHtml(category.name)}
                        ${needsManualCheck ? ' <span class="text-yellow-600 text-xs">⚠️ Потрібна перевірка</span>' : ''}
                    </a>
                    ${category.url && category.url !== '' && category.url !== 'null' ? `
                    <a href="${escapeHtml(category.url)}" target="_blank" 
                       class="text-blue-600 hover:underline text-xs truncate max-w-xs" 
                       title="${escapeHtml(category.url)}">
                        ${escapeHtml(category.url.length > 50 ? category.url.substring(0, 47) + '...' : category.url)}
                    </a>
                    ` : '<span class="text-gray-400 text-xs">[URL відсутній]</span>'}
                </div>
                <div id="children-${category.id}" class="hidden">
                    ${hasChildren ? renderCategories(category.children, competitorId, level + 1) : ''}
                </div>
            </div>
        `;
        return html;
    }).join('');
}

// Перемикання видимості підкатегорій
function toggleCategory(categoryId) {
    const childrenDiv = document.getElementById(`children-${categoryId}`);
    const icon = document.getElementById(`icon-${categoryId}`);
    
    if (childrenDiv.classList.contains('hidden')) {
        childrenDiv.classList.remove('hidden');
        icon.style.transform = 'rotate(90deg)';
    } else {
        childrenDiv.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
}

// Оновлення категорій (використовуємо окрему функцію для оновлення з порівнянням)
// Якщо категорій ще немає, просто додаємо нові (працює як парсинг)
document.getElementById('updateCategoriesBtn').addEventListener('click', async () => {
    const hasCategories = originalCategories && originalCategories.length > 0;
    const confirmMessage = hasCategories 
        ? 'Оновити категорії для цього конкурента? Система порівняє старі та нові категорії, додасть нові та позначить незнайдені для ручної перевірки.'
        : 'Спарсити категорії для цього конкурента? Це може зайняти деякий час.';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    const btn = document.getElementById('updateCategoriesBtn');
    btn.disabled = true;
    btn.textContent = 'Запуск...';
    
    try {
        // Створюємо фонову задачу на оновлення
        await createUpdateCategoriesTask(competitorId);
        btn.textContent = 'В процесі…';
    } catch (error) {
        btn.textContent = 'Оновити категорії';
        btn.disabled = false;
        alert('Помилка запуску оновлення: ' + error.message);
    }
});

// Зберігаємо оригінальні категорії для фільтрації
let originalCategories = [];

// Оновлення видимості кнопок
function updateDiscoverButton() {
    const checkboxes = document.querySelectorAll('.category-select:checked');
    const discoverBtn = document.getElementById('discover-products-btn');
    const deleteBtn = document.getElementById('delete-selected-btn');
    
    if (checkboxes.length > 0) {
        discoverBtn.classList.remove('hidden');
        deleteBtn.classList.remove('hidden');
    } else {
        discoverBtn.classList.add('hidden');
        deleteBtn.classList.add('hidden');
    }
}

// Пошук по категоріях
function filterCategories() {
    const searchInput = document.getElementById('categorySearch');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const container = document.getElementById('categoriesTree');
    
    if (!searchTerm) {
        // Якщо пошук порожній, показуємо всі категорії
        if (originalCategories.length > 0) {
            displayCategoriesTree(originalCategories, competitorId);
        }
        // Скидаємо текст кнопки "Обрати всі"
        const selectAllBtn = document.getElementById('select-all-categories-btn');
        if (selectAllBtn) {
            selectAllBtn.textContent = 'Обрати всі';
        }
        return;
    }
    
    // Фільтруємо категорії
    function filterCategoriesRecursive(categories, term) {
        const filtered = [];
        for (const cat of categories) {
            const matches = cat.name.toLowerCase().includes(term) || 
                          (cat.url && cat.url.toLowerCase().includes(term));
            
            const filteredChildren = cat.children ? filterCategoriesRecursive(cat.children, term) : [];
            
            if (matches || filteredChildren.length > 0) {
                filtered.push({
                    ...cat,
                    children: filteredChildren
                });
            }
        }
        return filtered;
    }
    
    const filtered = filterCategoriesRecursive(originalCategories, searchTerm);
    displayCategoriesTree(filtered, competitorId);
    
    // Автоматично розгортаємо всі категорії при пошуку
    const allChildrenDivs = document.querySelectorAll('[id^="children-"]');
    allChildrenDivs.forEach(div => {
        div.classList.remove('hidden');
        const categoryId = div.id.replace('children-', '');
        const icon = document.getElementById(`icon-${categoryId}`);
        if (icon) {
            icon.style.transform = 'rotate(90deg)';
        }
    });
}

// Обрати всі категорії
function selectAllCategories() {
    const checkboxes = document.querySelectorAll('.category-select');
    const visibleCheckboxes = Array.from(checkboxes).filter(cb => {
        // Перевіряємо, чи checkbox видимий (не прихований через пошук)
        const categoryItem = cb.closest('.category-item');
        return categoryItem && !categoryItem.closest('.hidden');
    });
    
    if (visibleCheckboxes.length === 0) {
        return;
    }
    
    const allSelected = visibleCheckboxes.every(cb => cb.checked);
    const selectAllBtn = document.getElementById('select-all-categories-btn');
    
    // Якщо всі видимі вже вибрані - знімаємо всі, інакше - вибираємо всі видимі
    visibleCheckboxes.forEach(cb => {
        cb.checked = !allSelected;
    });
    
    // Оновлюємо текст кнопки
    if (selectAllBtn) {
        selectAllBtn.textContent = allSelected ? 'Обрати всі' : 'Зняти всі';
    }
    
    updateDiscoverButton();
}

// Видалення вибраних категорій
async function deleteSelectedCategories() {
    const checkboxes = document.querySelectorAll('.category-select:checked');
    const selectedCategoryIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
    
    if (selectedCategoryIds.length === 0) {
        alert('Виберіть хоча б одну категорію для видалення');
        return;
    }
    
    if (!confirm(`Ви впевнені, що хочете видалити ${selectedCategoryIds.length} вибраних категорій? Цю дію неможливо скасувати.`)) {
        return;
    }
    
    const btn = document.getElementById('delete-selected-btn');
    btn.disabled = true;
    btn.textContent = 'Видалення...';
    
    try {
        const response = await fetch(`/competitors/${competitorId}/delete_categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                category_ids: selectedCategoryIds
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Помилка видалення категорій');
        }
        
        // Показуємо повідомлення про успіх
        showToast(`✅ Видалено ${selectedCategoryIds.length} категорій`, 'success');
        
        // Оновлюємо дерево категорій
        loadCompetitor();
        
    } catch (error) {
        console.error('Помилка видалення категорій:', error);
        showToast('❌ ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🗑️ Видалити вибране';
    }
}

// Запуск пошуку товарів у вибраних категоріях
async function discoverProducts() {
    const checkboxes = document.querySelectorAll('.category-select:checked');
    const selectedCategoryIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
    
    if (selectedCategoryIds.length === 0) {
        alert('Виберіть хоча б одну категорію');
        return;
    }
    
    if (!confirm(`Знайти товари у ${selectedCategoryIds.length} вибраних категоріях? Це може зайняти деякий час.`)) {
        return;
    }
    
    const btn = document.getElementById('discover-products-btn');
    btn.disabled = true;
    btn.textContent = 'Запуск...';
    
    try {
        // Створюємо фонову задачу
        await createDiscoverProductsTask(competitorId, selectedCategoryIds);
        btn.textContent = 'В процесі…';
    } catch (error) {
        btn.textContent = 'Знайти товари у вибраних категоріях';
        btn.disabled = false;
        alert('Помилка запуску пошуку: ' + error.message);
    }
}

// Екранування HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Відкриття модального вікна для додавання категорії
function openAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.classList.remove('hidden');
        // Очищаємо форму
        document.getElementById('addCategoryForm').reset();
    }
}

// Закриття модального вікна
function closeAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.classList.add('hidden');
        // Очищаємо форму
        document.getElementById('addCategoryForm').reset();
    }
}

// Додавання категорії вручну
async function addCategoryManually() {
    const urlInput = document.getElementById('categoryUrl');
    const nameInput = document.getElementById('categoryName');
    const submitBtn = document.getElementById('submitAddCategory');
    
    const url = urlInput.value.trim();
    const name = nameInput.value.trim();
    
    if (!url || !name) {
        alert('Будь ласка, заповніть всі поля');
        return;
    }
    
    // Валідація URL
    try {
        new URL(url);
    } catch (e) {
        alert('Будь ласка, введіть правильний URL');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Додавання...';
    
    try {
        const response = await fetch(`/competitors/${competitorId}/add_category`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                name: name
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Помилка додавання категорії');
        }
        
        const result = await response.json();
        
        // Закриваємо модальне вікно
        closeAddCategoryModal();
        
        // Показуємо повідомлення про успіх
        showToast('✅ Категорія успішно додана!\nНазва буде автоматично оновлена при парсингу.', 'success');
        
        // Оновлюємо дерево категорій
        loadCompetitor();
        
    } catch (error) {
        console.error('Помилка додавання категорії:', error);
        // Показуємо помилку у спливаючому вікні
        const errorMessage = error.message || 'Помилка додавання категорії';
        showToast('❌ ' + errorMessage, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Додати';
    }
}

// Завантаження при завантаженні сторінки
loadCompetitor();

// Додаємо обробники подій
document.addEventListener('DOMContentLoaded', () => {
    // Кнопка "Знайти товари"
    const discoverBtn = document.getElementById('discover-products-btn');
    if (discoverBtn) {
        discoverBtn.addEventListener('click', discoverProducts);
    }
    
    // Кнопка "Видалити вибране"
    const deleteBtn = document.getElementById('delete-selected-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedCategories);
    }
    
    // Кнопка "Обрати всі"
    const selectAllBtn = document.getElementById('select-all-categories-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', selectAllCategories);
    }
    
    // Пошукач по категоріях
    const searchInput = document.getElementById('categorySearch');
    if (searchInput) {
        searchInput.addEventListener('input', filterCategories);
    }
    
    // Кнопка "Додати категорію вручну"
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', openAddCategoryModal);
    }
    
    // Кнопка закриття модального вікна
    const closeBtn = document.getElementById('closeAddCategoryModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAddCategoryModal);
    }
    
    // Кнопка скасування
    const cancelBtn = document.getElementById('cancelAddCategory');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeAddCategoryModal);
    }
    
    // Форма додавання категорії
    const addCategoryForm = document.getElementById('addCategoryForm');
    if (addCategoryForm) {
        addCategoryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addCategoryManually();
        });
    }
    
    // Закриття модального вікна при кліку поза ним
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAddCategoryModal();
            }
        });
    }
});

