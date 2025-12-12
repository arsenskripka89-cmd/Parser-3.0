// Отримуємо ID з URL
const urlParts = window.location.pathname.split('/');
const competitorId = urlParts[urlParts.length - 3];
const categoryId = urlParts[urlParts.length - 1];

// Завантаження даних категорії
async function loadCategory() {
    try {
        const response = await fetch(`/competitors/${competitorId}/category/${categoryId}/data`);
        if (!response.ok) {
            throw new Error('Категорія не знайдена');
        }
        const data = await response.json();
        displayCategory(data);
    } catch (error) {
        console.error('Помилка завантаження:', error);
        document.getElementById('categoryName').textContent = 'Помилка завантаження';
    }
}

// Відображення даних категорії
function displayCategory(data) {
    const category = data.category;
    const competitor = data.competitor;
    const breadcrumb = data.breadcrumb;
    
    // Заголовок
    document.getElementById('categoryName').textContent = category.name;
    
    // URL
    const urlLink = document.getElementById('categoryUrl');
    urlLink.href = category.url;
    urlLink.textContent = category.url;
    
    // Підкатегорії
    document.getElementById('subcategoriesCount').textContent = data.subcategories_count || 0;
    
    // Breadcrumb
    const breadcrumbContainer = document.getElementById('breadcrumb');
    breadcrumbContainer.innerHTML = breadcrumb.map((item, index) => {
        const isLast = index === breadcrumb.length - 1;
        return isLast 
            ? `<span class="text-gray-800 font-semibold">${escapeHtml(item.name)}</span>`
            : `<a href="${item.url}" class="text-blue-600 hover:underline">${escapeHtml(item.name)}</a> <span class="mx-2">/</span>`;
    }).join('');
}

// Оновлення категорії
document.getElementById('updateCategoryBtn').addEventListener('click', async () => {
    if (!confirm('Оновити категорію? Це оновить всі категорії конкурента.')) {
        return;
    }
    
    const btn = document.getElementById('updateCategoryBtn');
    btn.disabled = true;
    btn.textContent = 'Оновлення...';
    
    try {
        const response = await fetch(`/competitors/${competitorId}/parse_categories`, {
            method: 'POST'
        });
        
        if (response.ok) {
            alert('Категорії успішно оновлено!');
            loadCategory();
        } else {
            const error = await response.json();
            alert('Помилка оновлення: ' + (error.detail || 'Невідома помилка'));
        }
    } catch (error) {
        console.error('Помилка:', error);
        alert('Помилка оновлення категорії');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Оновити категорію';
    }
});

// Екранування HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Завантаження при завантаженні сторінки
loadCategory();










