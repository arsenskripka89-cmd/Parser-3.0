// Завантаження списку ключів
async function loadKeys() {
    try {
        const response = await fetch('/settings/keys');
        const data = await response.json();
        
        // Отримуємо вибраний період
        const periodSelect = document.getElementById('periodSelect');
        const period = periodSelect ? periodSelect.value : 'all';
        
        // Завантажуємо статистику токенів для кожного ключа
        const keysWithStats = await Promise.all(
            data.keys.map(async (key) => {
                const stats = await getTokenStatsForPeriod(key.id, period);
                return { ...key, tokenStats: stats };
            })
        );
        
        displayKeys(keysWithStats, data.current_key);
    } catch (error) {
        console.error('Помилка завантаження ключів:', error);
        document.getElementById('keysTableBody').innerHTML = 
            '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">Помилка завантаження</td></tr>';
    }
}

// Отримання статистики токенів за період
async function getTokenStatsForPeriod(keyId, period) {
    try {
        let startDate = null;
        let endDate = null;
        const now = new Date();
        
        if (period === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            endDate = now.toISOString();
        } else if (period === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            endDate = now.toISOString();
        } else if (period === 'month') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            endDate = now.toISOString();
        }
        
        const url = `/settings/token_stats/${keyId}${startDate ? `?start_date=${startDate}&end_date=${endDate}` : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Помилка отримання статистики токенів:', error);
        return {
            total_tokens: 0,
            total_requests: 0,
            total_prompt_tokens: 0,
            total_completion_tokens: 0
        };
    }
}

// Відображення ключів у таблиці
function displayKeys(keys, currentKeyId) {
    const tbody = document.getElementById('keysTableBody');
    
    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">Немає ключів. Додайте перший ключ.</td></tr>';
        return;
    }
    
    tbody.innerHTML = keys.map(key => {
        const maskedKey = maskKey(key.key);
        const isActive = key.id === currentKeyId;
        const statusBadge = isActive 
            ? '<span class="bg-green-100 text-green-700 rounded-md px-2 py-1 text-sm font-medium">Активний</span>'
            : '<span class="bg-gray-100 text-gray-600 rounded-md px-2 py-1 text-sm font-medium">Неактивний</span>';
        
        // Форматуємо статистику токенів
        const stats = key.tokenStats || {};
        const totalTokens = stats.total_tokens || 0;
        const totalRequests = stats.total_requests || 0;
        const promptTokens = stats.total_prompt_tokens || 0;
        const completionTokens = stats.total_completion_tokens || 0;
        
        const tokenDisplay = totalTokens > 0 
            ? `<div class="flex flex-col gap-1">
                <strong class="text-[#1f2937] text-sm">${formatNumber(totalTokens)}</strong> токенів
                <small class="text-gray-500 text-xs">(${totalRequests} запитів)</small>
                <div class="flex gap-2 text-xs text-gray-500 mt-1">
                    <span>Prompt: ${formatNumber(promptTokens)}</span>
                    <span>Completion: ${formatNumber(completionTokens)}</span>
                </div>
               </div>`
            : '<span class="text-gray-400 italic">Немає даних</span>';
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-[#1f2937]">${key.name}</td>
                <td class="px-4 py-3 text-gray-600 font-mono text-sm">${maskedKey}</td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3 text-gray-600">${tokenDisplay}</td>
                <td class="px-4 py-3">
                    <div class="flex gap-2">
                        ${!isActive ? `
                            <button class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm text-sm font-medium transition" onclick="activateKey('${key.id}')">
                                Активувати
                            </button>
                        ` : ''}
                        <button class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm text-sm font-medium transition" onclick="deleteKey('${key.id}')">
                            Видалити
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Форматування чисел з розділювачами
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Маскування ключа
function maskKey(key) {
    if (!key || key.length < 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

// Активація ключа
async function activateKey(keyId) {
    if (!confirm('Активувати цей ключ? Поточний активний ключ буде деактивовано.')) {
        return;
    }
    
    try {
        const response = await fetch(`/settings/activate_key/${keyId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Ключ успішно активовано!');
            loadKeys();
        } else {
            alert('Помилка активації ключа');
        }
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
}

// Видалення ключа
async function deleteKey(keyId) {
    if (!confirm('Видалити цей ключ? Цю дію неможливо скасувати.')) {
        return;
    }
    
    try {
        const response = await fetch(`/settings/delete_key/${keyId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Ключ успішно видалено!');
            loadKeys();
        } else {
            const errorData = await response.json();
            alert('Помилка: ' + (errorData.detail || 'Невідома помилка'));
        }
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
}

// Додавання нового ключа
const form = document.getElementById('addKeyForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    const keyData = {
        name: formData.get('name'),
        key: formData.get('key')
    };
    
    try {
        const response = await fetch('/settings/add_key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(keyData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Ключ успішно додано!');
            form.reset();
            loadKeys();
        } else {
            alert('Помилка додавання ключа');
        }
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
});

// Завантаження при старті
document.addEventListener('DOMContentLoaded', () => {
    loadKeys();
});

