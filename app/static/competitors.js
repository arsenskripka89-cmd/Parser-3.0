// Завантаження списку конкурентів
async function loadCompetitors() {
    try {
        const response = await fetch('/competitors/list');
        const data = await response.json();
        displayCompetitors(data.competitors);
    } catch (error) {
        console.error('Помилка завантаження конкурентів:', error);
        document.getElementById('competitorsTableBody').innerHTML = 
            '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">Помилка завантаження</td></tr>';
    }
}

// Відображення конкурентів у таблиці
function displayCompetitors(competitors) {
    const tbody = document.getElementById('competitorsTableBody');
    
    if (competitors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">Немає конкурентів</td></tr>';
        return;
    }
    
    tbody.innerHTML = competitors.map(competitor => {
        const categoriesCount = countCategories(competitor.categories || []);
        const lastParsed = competitor.last_parsed 
            ? new Date(competitor.last_parsed).toLocaleString('uk-UA')
            : 'Ніколи';
        const statusBadge = competitor.active 
            ? '<span class="bg-green-100 text-green-700 rounded-md px-2 py-1 text-sm">Активний</span>'
            : '<span class="bg-gray-100 text-gray-600 rounded-md px-2 py-1 text-sm">Неактивний</span>';
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-800 font-medium">${escapeHtml(competitor.name)}</td>
                <td class="px-4 py-3">
                    <a href="${escapeHtml(competitor.url)}" target="_blank" 
                       class="text-blue-600 hover:underline text-sm">
                        ${escapeHtml(competitor.url)}
                    </a>
                </td>
                <td class="px-4 py-3 text-gray-600">${categoriesCount}</td>
                <td class="px-4 py-3 text-gray-600 text-sm">${lastParsed}</td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3">
                    <div class="flex gap-2">
                        <button onclick="parseCategories('${competitor.id}')" 
                                class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded shadow-sm transition">
                            Спарсити категорії
                        </button>
                        <a href="/competitor/${competitor.id}" 
                           class="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs px-3 py-1 rounded shadow-sm transition inline-block">
                            Переглянути
                        </a>
                        <button onclick="deleteCompetitor('${competitor.id}')" 
                                class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded shadow-sm transition">
                            Видалити
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Підрахунок категорій (рекурсивно)
function countCategories(categories) {
    let count = categories.length;
    for (const cat of categories) {
        if (cat.children && cat.children.length > 0) {
            count += countCategories(cat.children);
        }
    }
    return count;
}

// Додавання конкурента
document.getElementById('addCompetitorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('competitorName').value,
        url: document.getElementById('competitorUrl').value,
        notes: document.getElementById('competitorNotes').value
    };
    
    try {
        const response = await fetch('/competitors/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            document.getElementById('addCompetitorModal').style.display = 'none';
            document.getElementById('addCompetitorForm').reset();
            loadCompetitors();
        } else {
            alert('Помилка додавання конкурента');
        }
    } catch (error) {
        console.error('Помилка:', error);
        alert('Помилка додавання конкурента');
    }
});

// Парсинг категорій (використовуємо фонову задачу)
async function parseCategories(competitorId) {
    if (!confirm('Спарсити категорії для цього конкурента? Це може зайняти деякий час.')) {
        return;
    }
    
    // Знаходимо кнопку для оновлення тексту
    const buttons = document.querySelectorAll(`button[onclick*="parseCategories('${competitorId}')"]`);
    let btn = null;
    if (buttons.length > 0) {
        btn = buttons[0];
        btn.disabled = true;
        btn.textContent = 'Запуск...';
    }
    
    try {
        // Створюємо фонову задачу
        await createParseCategoriesTask(competitorId);
        if (btn) {
            btn.textContent = 'В процесі…';
        }
    } catch (error) {
        if (btn) {
            btn.textContent = 'Спарсити категорії';
            btn.disabled = false;
        }
        alert('Помилка запуску парсингу: ' + error.message);
    }
}

// Видалення конкурента
async function deleteCompetitor(competitorId) {
    if (!confirm('Ви впевнені, що хочете видалити цього конкурента?')) {
        return;
    }
    
    try {
        const response = await fetch(`/competitors/${competitorId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadCompetitors();
        } else {
            alert('Помилка видалення конкурента');
        }
    } catch (error) {
        console.error('Помилка:', error);
        alert('Помилка видалення конкурента');
    }
}

// Модальне вікно
const modal = document.getElementById('addCompetitorModal');
const addBtn = document.getElementById('addCompetitorBtn');
const closeBtn = document.querySelector('.close');

addBtn.onclick = function() {
    modal.style.display = 'block';
};

closeBtn.onclick = function() {
    modal.style.display = 'none';
};

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

// Екранування HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Завантаження при завантаженні сторінки
loadCompetitors();

