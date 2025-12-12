// Отримуємо ID товару з URL
function getProductId() {
    const path = window.location.pathname;
    const match = path.match(/\/product\/([^\/]+)/);
    return match ? match[1] : null;
}

let priceChart = null;
let productData = null;

// Завантаження даних товару
async function loadProduct() {
    console.log('=== loadProduct ВИКЛИКАНО ===');
    const productId = getProductId();
    console.log('Product ID:', productId);
    
    if (!productId) {
        console.error('ID товару не знайдено');
        alert('ID товару не знайдено');
        return;
    }

    try {
        console.log('Завантаження даних товару з API...');
        const response = await fetch(`/products/${productId}`);
        console.log('Відповідь отримано:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Помилка відповіді:', errorText);
            throw new Error(`Помилка завантаження товару: ${response.status} - ${errorText}`);
        }
        
        productData = await response.json();
        console.log('Дані товару отримано:', productData);
        console.log('Викликаємо displayProduct...');
        await displayProduct(productData);
        console.log('displayProduct завершено');
    } catch (error) {
        console.error('Помилка завантаження товару:', error);
        console.error('Stack trace:', error.stack);
        alert('Помилка завантаження товару: ' + error.message);
    }
}

// Відображення даних товару
async function displayProduct(data) {
    console.log('=== displayProduct ПОЧАТОК ===');
    console.log('Дані товару:', data);
    
    try {
        // БЛОК 1: Заголовок
        console.log('Відображення заголовка...');
        const productNameEl = document.getElementById('productName');
        const productSkuEl = document.getElementById('productSku');
        
        if (!productNameEl || !productSkuEl) {
            console.error('Елементи заголовка не знайдено!');
            return;
        }
        
        productNameEl.textContent = data.name || '-';
        productSkuEl.textContent = data.sku || '-';
        console.log('Заголовок відображено:', data.name, data.sku);
    
    // Конкурент (клікабельне посилання)
    const competitorNameEl = document.getElementById('competitorName');
    if (!competitorNameEl) {
        console.error('Елемент competitorName не знайдено!');
    }
    
    let competitorId = null;
    let competitorName = '';
    
    // Спочатку перевіряємо, чи є competitor_id в даних товару
    if (data.competitor_id) {
        competitorId = data.competitor_id;
        console.log(`Використано competitor_id з даних товару: ${competitorId}`);
        
        // Отримуємо актуальну назву конкурента з бази даних
        try {
            const competitorResponse = await fetch(`/competitors/${competitorId}`);
            if (competitorResponse.ok) {
                const competitor = await competitorResponse.json();
                if (competitor && competitor.name) {
                    competitorName = competitor.name;
                    console.log(`Отримано назву конкурента з бази даних: ${competitorName}`);
                }
            } else {
                console.warn(`Помилка отримання конкурента: ${competitorResponse.status}`);
            }
        } catch (error) {
            console.error('Помилка отримання назви конкурента:', error);
        }
    }
    
    // Якщо не знайдено competitor_id, шукаємо за категорією
    if (!competitorId && data.category_path && data.category_path.length > 0) {
        try {
            console.log(`Шукаємо конкурента за категорією: ${data.category_path.join(' / ')}`);
            // Формуємо URL з параметрами для списку категорій
            const categoryPathParams = data.category_path.map(cat => `category_path=${encodeURIComponent(cat)}`).join('&');
            const competitorResponse = await fetch(`/competitors/by_category?${categoryPathParams}`);
            if (competitorResponse.ok) {
                const competitor = await competitorResponse.json();
                if (competitor && competitor.id) {
                    competitorId = competitor.id;
                    competitorName = competitor.name;
                    console.log(`Знайдено конкурента за категорією: ${competitorName} (ID: ${competitorId})`);
                } else {
                    console.warn(`Конкурент не знайдено за категорією: ${data.category_path.join(' / ')}`);
                }
            } else {
                console.warn(`Помилка пошуку конкурента за категорією: ${competitorResponse.status}`);
            }
        } catch (error) {
            console.error('Помилка пошуку конкурента за категорією:', error);
        }
    }
    
    // Якщо все ще не знайдено, шукаємо за назвою
    if (!competitorId && data.competitor_name) {
        try {
            console.log(`Шукаємо конкурента за назвою: ${data.competitor_name}`);
            const competitorResponse = await fetch(`/competitors/by_name/${encodeURIComponent(data.competitor_name)}`);
            if (competitorResponse.ok) {
                const competitor = await competitorResponse.json();
                if (competitor && competitor.id) {
                    competitorId = competitor.id;
                    competitorName = competitor.name; // Використовуємо назву з бази даних
                    console.log(`Знайдено конкурента за назвою: ${competitorName} (ID: ${competitorId})`);
                } else {
                    console.warn(`Конкурент не знайдено за назвою: ${data.competitor_name}`);
                }
            } else {
                console.warn(`Помилка пошуку конкурента за назвою: ${competitorResponse.status}`);
            }
        } catch (error) {
            console.error('Помилка пошуку конкурента за назвою:', error);
        }
    }
    
    // Відображаємо конкурента з посиланням, якщо знайдено ID
    if (competitorNameEl) {
        if (competitorId && competitorName) {
            competitorNameEl.innerHTML = `<a href="/competitor/${competitorId}" class="text-blue-600 hover:underline font-medium">${escapeHtml(competitorName)}</a>`;
        } else if (competitorName) {
            // Якщо не знайдено ID, але є назва, показуємо просто текст
            competitorNameEl.textContent = competitorName;
            console.warn(`Не вдалося знайти ID конкурента для: ${competitorName}`);
        } else {
            competitorNameEl.textContent = '-';
        }
    }
    
    // Категорії (breadcrumb) - стиль CS-Cart з клікабельними посиланнями
    const categoryPath = data.category_path || [];
    const categoryPathEl = document.getElementById('categoryPath');
    
    if (!categoryPathEl) {
        console.error('Елемент categoryPath не знайдено!');
    }
    
    if (categoryPath.length > 0 && categoryPathEl) {
        // Використовуємо competitorId, який ми знайшли вище
        if (competitorId) {
            try {
                // Отримуємо повну інформацію про конкурента для доступу до категорій
                console.log(`Отримуємо категорії конкурента: ${competitorId}`);
                const competitorFullResponse = await fetch(`/competitors/${competitorId}`);
                if (competitorFullResponse.ok) {
                    const competitorFull = await competitorFullResponse.json();
                    const categories = competitorFull.categories || [];
                    console.log(`Отримано ${categories.length} категорій для конкурента`);
                    const breadcrumbHtml = await renderCategoryBreadcrumb(categoryPath, competitorId, categories);
                    categoryPathEl.innerHTML = breadcrumbHtml;
                } else {
                    console.warn(`Не вдалося отримати категорії: ${competitorFullResponse.status}`);
                    // Якщо не вдалося отримати категорії, показуємо без посилань
                    categoryPathEl.innerHTML = categoryPath.map((cat, index) => {
                        if (index === categoryPath.length - 1) {
                            return `<span class="text-gray-800 font-medium">${escapeHtml(cat)}</span>`;
                        }
                        return `<span class="text-gray-600 text-sm">${escapeHtml(cat)}</span> / `;
                    }).join('');
                }
            } catch (error) {
                console.error('Помилка отримання категорій:', error);
                // Якщо помилка, показуємо без посилань
                categoryPathEl.innerHTML = categoryPath.map((cat, index) => {
                    if (index === categoryPath.length - 1) {
                        return `<span class="text-gray-800 font-medium">${escapeHtml(cat)}</span>`;
                    }
                    return `<span class="text-gray-600 text-sm">${escapeHtml(cat)}</span> / `;
                }).join('');
            }
        } else {
            console.warn('Не знайдено competitor_id для категорій, показуємо без посилань');
            // Показуємо категорії без посилань, якщо не знайдено конкурента
            categoryPathEl.innerHTML = categoryPath.map((cat, index) => {
                if (index === categoryPath.length - 1) {
                    return `<span class="text-gray-800 font-medium">${escapeHtml(cat)}</span>`;
                }
                return `<span class="text-gray-600 text-sm">${escapeHtml(cat)}</span> / `;
            }).join('');
        }
    } else if (categoryPathEl) {
        categoryPathEl.textContent = '-';
    }
    
    // URL
    const urlLink = document.getElementById('productUrl');
    urlLink.href = data.url;
    urlLink.textContent = 'Відкрити сайт';

    // БЛОК 2: Актуальні дані
    const price = data.latest?.price;
    document.getElementById('currentPrice').textContent = price ? `${price} грн` : '-';
    
    const availability = data.latest?.availability;
    const availabilityEl = document.getElementById('currentAvailability');
    availabilityEl.textContent = availability || '-';
    
    // Кольори для наявності (бейджі CRM-стиль)
    if (availability === 'в наявності') {
        availabilityEl.className = 'bg-green-100 text-green-700 rounded-md px-2 py-1 text-sm font-medium inline-block';
    } else if (availability === 'немає в наявності') {
        availabilityEl.className = 'bg-red-100 text-red-700 rounded-md px-2 py-1 text-sm font-medium inline-block';
    } else if (availability === 'під замовлення') {
        availabilityEl.className = 'bg-yellow-100 text-yellow-700 rounded-md px-2 py-1 text-sm font-medium inline-block';
    } else {
        availabilityEl.className = 'bg-gray-100 text-gray-600 rounded-md px-2 py-1 text-sm font-medium inline-block';
    }
    
    const updatedAt = data.latest?.updated_at;
    if (updatedAt) {
        const date = new Date(updatedAt);
        document.getElementById('lastUpdated').textContent = date.toLocaleString('uk-UA');
    } else {
        document.getElementById('lastUpdated').textContent = '-';
    }

    // БЛОК 4: Таблиця історії (показуємо лише останні 3 записи)
    displayHistoryTable(data.history || [], data.history || []);

    // Зберігаємо повну історію для модального вікна
    window.fullHistoryData = data.history || [];

    // БЛОК 5: Правила парсингу - приховано, оскільки парсер працює через GPT
    // Правила парсингу використовуються для альтернативного методу парсингу через CSS селектори
    // Але основний парсер працює через GPT, тому цей блок не потрібен

    // БЛОК 7: Логи (показуємо лише останні 3 записи)
    displayLogs(data.logs || [], data.logs || []);

    // Зберігаємо всі логи для модального вікна
    window.fullLogsData = data.logs || [];
    
    // Завантажуємо характеристики для товару
    const productId = getProductId();
    console.log('=== displayProduct: Завантаження характеристик ===');
    console.log('Product ID:', productId);
    
    if (productId) {
        // Використовуємо функції з characteristics.js через window
        // Чекаємо, поки characteristics.js завантажиться
        const tryLoadCharacteristics = (attempt = 0) => {
            console.log(`Спроба ${attempt + 1}: перевірка функцій`);
            console.log('window.setCurrentProductId:', typeof window.setCurrentProductId);
            console.log('window.loadCharacteristics:', typeof window.loadCharacteristics);
            
            if (typeof window.setCurrentProductId === 'function' && typeof window.loadCharacteristics === 'function') {
                console.log('✅ Функції завантажені, викликаємо');
                window.setCurrentProductId(productId);
                // Невелика затримка перед викликом loadCharacteristics
                setTimeout(() => {
                    window.loadCharacteristics();
                }, 50);
            } else if (attempt < 20) {
                // Пробуємо ще раз через 50мс (більше спроб)
                setTimeout(() => tryLoadCharacteristics(attempt + 1), 50);
            } else {
                console.error('❌ Не вдалося завантажити функції характеристик після 20 спроб');
                console.error('setCurrentProductId:', typeof window.setCurrentProductId);
                console.error('loadCharacteristics:', typeof window.loadCharacteristics);
                console.error('Перевірте, чи characteristics.js завантажено перед product.js');
            }
        };
        
        // Починаємо спроби одразу (characteristics.js має бути завантажено перед product.js)
        tryLoadCharacteristics();
    } else {
        console.warn('Product ID не знайдено для характеристик');
    }
    
    console.log('=== displayProduct ЗАВЕРШЕНО ===');
    } catch (error) {
        console.error('Помилка в displayProduct:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Малювання графіка цін
function drawPriceChart(history) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    // Сортуємо історію за датою
    const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const labels = sortedHistory.map(h => {
        const date = new Date(h.date);
        return date.toLocaleDateString('uk-UA');
    });
    
    const prices = sortedHistory.map(h => h.price || null);
    
    // Знищуємо попередній графік, якщо він існує
    if (priceChart) {
        priceChart.destroy();
    }
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ціна (грн)',
                data: prices,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.1,
                fill: true,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#1f2937',
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

// Відображення таблиці історії (лише останні 3 записи)
function displayHistoryTable(history, fullHistory) {
    const tbody = document.getElementById('historyTableBody');
    
    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-3 text-center text-gray-500">Історія відсутня</td></tr>';
        return;
    }
    
    // Сортуємо за датою (від новіших до старіших)
    const sortedHistory = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
    // Беремо лише останні 3 записи
    const lastThree = sortedHistory.slice(0, 3);
    
    tbody.innerHTML = lastThree.map(h => {
        const date = new Date(h.date);
        const price = h.price ? `${h.price} грн` : '-';
        const availability = h.availability || '-';
        
        let availabilityClass = 'bg-gray-100 text-gray-600';
        if (availability === 'в наявності') {
            availabilityClass = 'bg-green-100 text-green-700';
        } else if (availability === 'немає в наявності') {
            availabilityClass = 'bg-red-100 text-red-700';
        } else if (availability === 'під замовлення') {
            availabilityClass = 'bg-yellow-100 text-yellow-700';
        }
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-[#1f2937]">${date.toLocaleString('uk-UA')}</td>
                <td class="px-4 py-3 text-[#1f2937]">${price}</td>
                <td class="px-4 py-3">
                    <span class="${availabilityClass.includes('green') ? 'bg-green-100 text-green-700' : availabilityClass.includes('red') ? 'bg-red-100 text-red-700' : availabilityClass.includes('yellow') ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'} rounded-md px-2 py-1 text-sm font-medium inline-block">${availability}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Відображення повної історії в модальному вікні
function displayFullHistory(history) {
    const tbody = document.getElementById('fullHistoryTableBody');
    
    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-3 text-center text-gray-500">Історія відсутня</td></tr>';
        return;
    }
    
    // Сортуємо за датою (від новіших до старіших)
    const sortedHistory = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    tbody.innerHTML = sortedHistory.map(h => {
        const date = new Date(h.date);
        const price = h.price ? `${h.price} грн` : '-';
        const availability = h.availability || '-';
        
        let availabilityClass = 'bg-gray-100 text-gray-600';
        if (availability === 'в наявності') {
            availabilityClass = 'bg-green-100 text-green-700';
        } else if (availability === 'немає в наявності') {
            availabilityClass = 'bg-red-100 text-red-700';
        } else if (availability === 'під замовлення') {
            availabilityClass = 'bg-yellow-100 text-yellow-700';
        }
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-[#1f2937]">${date.toLocaleString('uk-UA')}</td>
                <td class="px-4 py-3 text-[#1f2937]">${price}</td>
                <td class="px-4 py-3">
                    <span class="${availabilityClass.includes('green') ? 'bg-green-100 text-green-700' : availabilityClass.includes('red') ? 'bg-red-100 text-red-700' : availabilityClass.includes('yellow') ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'} rounded-md px-2 py-1 text-sm font-medium inline-block">${availability}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Відображення логів (лише останні 3 записи)
function displayLogs(logs, fullLogs) {
    const tbody = document.getElementById('logsTableBody');
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-3 text-center text-gray-500">Логи відсутні</td></tr>';
        return;
    }
    
    // Сортуємо за датою (від новіших до старіших)
    const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
    // Беремо лише останні 3 записи
    const lastThree = sortedLogs.slice(0, 3);
    
    tbody.innerHTML = lastThree.map(log => {
        const date = new Date(log.date);
        const status = log.status || 'unknown';
        
        let statusClass = 'bg-gray-100 text-gray-600';
        let statusText = status;
        if (status === 'success') {
            statusClass = 'bg-green-100 text-green-700';
            statusText = 'Успішно';
        } else if (status === 'error') {
            statusClass = 'bg-red-100 text-red-700';
            statusText = 'Помилка';
        }
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-[#1f2937]">${date.toLocaleString('uk-UA')}</td>
                <td class="px-4 py-3 text-gray-600">${log.operation || '-'}</td>
                <td class="px-4 py-3">
                    <span class="${statusClass.includes('green') ? 'bg-green-100 text-green-700' : statusClass.includes('red') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'} rounded-md px-2 py-1 text-sm font-medium inline-block">${statusText}</span>
                </td>
                <td class="px-4 py-3 text-gray-600">${log.message || '-'}</td>
            </tr>
        `;
    }).join('');
}

// Відображення всіх логів в модальному вікні
function displayFullLogs(logs) {
    const tbody = document.getElementById('fullLogsTableBody');
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-3 text-center text-gray-500">Логи відсутні</td></tr>';
        return;
    }
    
    // Сортуємо за датою (від новіших до старіших)
    const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    tbody.innerHTML = sortedLogs.map(log => {
        const date = new Date(log.date);
        const status = log.status || 'unknown';
        
        let statusClass = 'bg-gray-100 text-gray-600';
        let statusText = status;
        if (status === 'success') {
            statusClass = 'bg-green-100 text-green-700';
            statusText = 'Успішно';
        } else if (status === 'error') {
            statusClass = 'bg-red-100 text-red-700';
            statusText = 'Помилка';
        }
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-[#1f2937]">${date.toLocaleString('uk-UA')}</td>
                <td class="px-4 py-3 text-gray-600">${log.operation || '-'}</td>
                <td class="px-4 py-3">
                    <span class="${statusClass.includes('green') ? 'bg-green-100 text-green-700' : statusClass.includes('red') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'} rounded-md px-2 py-1 text-sm font-medium inline-block">${statusText}</span>
                </td>
                <td class="px-4 py-3 text-gray-600">${log.message || '-'}</td>
            </tr>
        `;
    }).join('');
}

// Регенерація правил
async function regenerateRules() {
    const productId = getProductId();
    if (!productId) return;
    
    const btn = document.getElementById('regenerateRulesBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Генерація...';
    
    try {
        const response = await fetch(`/products/regenerate_rules/${productId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Помилка сервера' }));
            throw new Error(errorData.detail || `Помилка ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            alert('Правила успішно регенеровано!');
            // Оновлюємо відображення правил
            document.getElementById('parsingRules').textContent = JSON.stringify(data.rules, null, 2);
            // Перезавантажуємо дані товару для оновлення логів
            await loadProduct();
        } else {
            throw new Error('Помилка регенерації правил');
        }
    } catch (error) {
        alert('Помилка регенерації правил: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Тестування правил
async function testRules() {
    const productId = getProductId();
    if (!productId) return;
    
    const btn = document.getElementById('testRulesBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Тестування...';
    
    try {
        const response = await fetch(`/products/test_rules/${productId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Помилка сервера' }));
            throw new Error(errorData.detail || `Помилка ${response.status}`);
        }
        
        const data = await response.json();
        displayTestResult(data);
        
        // Перезавантажуємо дані товару для оновлення логів
        await loadProduct();
    } catch (error) {
        alert('Помилка тестування правил: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Відображення результату тесту
function displayTestResult(result) {
    const block = document.getElementById('testResultBlock');
    const content = document.getElementById('testResultContent');
    
    block.classList.remove('hidden');
    
    if (result.success) {
        content.innerHTML = `
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-green-800 mb-2">✅ Тест пройдено успішно!</h4>
                <div class="bg-white rounded p-3">
                    <h5 class="font-semibold mb-2">Витягнуті дані:</h5>
                    <pre class="text-sm text-gray-800 overflow-x-auto">${JSON.stringify(result.extracted, null, 2)}</pre>
                </div>
            </div>
        `;
    } else {
        let errorsHtml = '';
        if (result.errors && result.errors.length > 0) {
            errorsHtml = `
                <div class="mt-3">
                    <h5 class="font-semibold mb-2">Помилки:</h5>
                    <ul class="list-disc list-inside space-y-1">
                        ${result.errors.map(err => `<li class="text-red-600">${err}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        content.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 class="font-semibold text-red-800 mb-2">❌ Тест не пройдено</h4>
                ${result.extracted && Object.keys(result.extracted).length > 0 ? `
                    <div class="bg-white rounded p-3 mb-3">
                        <h5 class="font-semibold mb-2">Частково витягнуті дані:</h5>
                        <pre class="text-sm text-gray-800 overflow-x-auto">${JSON.stringify(result.extracted, null, 2)}</pre>
                    </div>
                ` : ''}
                ${errorsHtml}
            </div>
        `;
    }
}

// Парсинг зараз (використовуємо фонову задачу)
async function parseNow() {
    const productId = getProductId();
    if (!productId) return;
    
    const btn = document.getElementById('parseNowBtn');
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

// Парсинг всіх даних (повний парсинг) - залишаємо синхронним, бо це окрема операція
async function parseFull() {
    const productId = getProductId();
    if (!productId) return;
    
    const btn = document.getElementById('parseFullBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Парсинг всіх даних...';
    
    try {
        const response = await fetch(`/products/parse_full/${productId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Помилка сервера' }));
            throw new Error(errorData.detail || `Помилка ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Всі дані товару успішно спарсено!', 'success');
            // Перезавантажуємо дані товару
            await loadProduct();
        } else {
            throw new Error('Помилка парсингу');
        }
    } catch (error) {
        showToast('Помилка парсингу всіх даних: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Рендеринг breadcrumb категорій з посиланнями
async function renderCategoryBreadcrumb(categoryPath, competitorId, categories) {
    console.log('renderCategoryBreadcrumb викликано:', { categoryPath, competitorId, categoriesCount: categories.length });
    
    // Рекурсивна функція для пошуку категорії за назвою (з підтримкою часткового збігу)
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
            
            // Частковий збіг (назва містить шукану назву або навпаки)
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
                breadcrumbHtml += `<span class="text-gray-800 font-medium">${escapeHtml(catName)}</span>`;
            } else {
                breadcrumbHtml += `<span class="text-gray-600 text-sm">${escapeHtml(catName)}</span> / `;
            }
            continue;
        }
        
        const result = findCategoryByName(parentCategories, catName, currentPath);
        
        if (result && result.category) {
            const category = result.category;
            console.log(`Знайдено категорію "${catName}" з ID: ${category.id}`);
            // Всі категорії (включаючи останню) мають посилання
            if (i === categoryPath.length - 1) {
                // Остання категорія - з посиланням, але виділена
                breadcrumbHtml += `<a href="/competitors/${competitorId}/category/${category.id}" class="text-blue-600 hover:underline font-medium">${escapeHtml(catName)}</a>`;
            } else {
                // Середні категорії - з посиланням
                breadcrumbHtml += `<a href="/competitors/${competitorId}/category/${category.id}" class="text-blue-600 hover:underline text-sm">${escapeHtml(catName)}</a> / `;
            }
            // Оновлюємо батьківські категорії для наступної ітерації
            parentCategories = category.children || [];
            currentPath = [...currentPath, category];
        } else {
            console.warn(`Категорію "${catName}" не знайдено в дереві категорій`);
            // Якщо категорію не знайдено, показуємо без посилання
            if (i === categoryPath.length - 1) {
                breadcrumbHtml += `<span class="text-gray-800 font-medium">${escapeHtml(catName)}</span>`;
            } else {
                breadcrumbHtml += `<span class="text-gray-600 text-sm">${escapeHtml(catName)}</span> / `;
            }
        }
    }
    
    console.log('Breadcrumb HTML:', breadcrumbHtml);
    return breadcrumbHtml;
}

// Екранування HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ХАРАКТЕРИСТИКАМИ ==========
// Всі функції для роботи з характеристиками перенесені в characteristics.js
// Тут залишаються тільки функції, специфічні для сторінки товару
// Використовуємо функції з characteristics.js через window

// Відкриття модального вікна для додавання групи
function openAddGroupModal() {
    document.getElementById('groupModalTitle').textContent = 'Додати групу характеристик';
    document.getElementById('groupForm').reset();
    document.getElementById('groupModalId').value = '';
    document.getElementById('groupModal').classList.remove('hidden');
}

// Відкриття модального вікна для редагування групи
function openEditGroupModal(groupId) {
    const group = groupsData.find(g => g.id === groupId);
    if (!group) return;
    
    document.getElementById('groupModalTitle').textContent = 'Редагувати групу характеристик';
    document.getElementById('groupModalId').value = group.id;
    document.getElementById('groupName').value = group.name;
    document.getElementById('groupDescription').value = group.description || '';
    document.getElementById('groupCategoryPath').value = (group.category_path || []).join(' > ');
    document.getElementById('groupModal').classList.remove('hidden');
}

// Відкриття модального вікна для додавання характеристики
function openAddCharacteristicModal() {
    document.getElementById('characteristicModalTitle').textContent = 'Додати характеристику';
    document.getElementById('characteristicForm').reset();
    document.getElementById('characteristicModalId').value = '';
    document.getElementById('characteristicUnitContainer').style.display = 'none';
    document.getElementById('characteristicModal').classList.remove('hidden');
}

// Відкриття модального вікна для редагування значення характеристики
function editCharacteristicValue(charId, charName, charType, currentValue, currentPhotoUrl) {
    document.getElementById('characteristicValueModalTitle').textContent = `Редагувати: ${escapeHtml(charName)}`;
    document.getElementById('characteristicValueLabel').textContent = charType === 'number' ? 'Значення (число)' : 'Значення';
    document.getElementById('characteristicValueCharId').value = charId;
    document.getElementById('characteristicValueValue').value = currentValue;
    // Поле фото видалено з інтерфейсу
    document.getElementById('characteristicValueModal').classList.remove('hidden');
}

// Збереження групи
async function saveGroup(e) {
    e.preventDefault();
    const groupId = document.getElementById('groupModalId').value;
    const name = document.getElementById('groupName').value;
    const description = document.getElementById('groupDescription').value;
    const categoryPathText = document.getElementById('groupCategoryPath').value;
    const categoryPath = categoryPathText ? categoryPathText.split(' > ').map(s => s.trim()).filter(s => s) : [];
    
    try {
        const url = groupId ? `/characteristics/groups/${groupId}` : '/characteristics/groups';
        const method = groupId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, category_path: categoryPath })
        });
        
        if (!response.ok) throw new Error('Помилка збереження групи');
        
        await loadGroups();
        await loadCharacteristics();
        updateCategoryFilter();
        closeGroupModal();
        showToast('✅ Групу успішно збережено', 'success');
    } catch (error) {
        showToast(`❌ Помилка: ${error.message}`, 'error');
    }
}

// Збереження характеристики
async function saveCharacteristic(e) {
    e.preventDefault();
    const charId = document.getElementById('characteristicModalId').value;
    const name = document.getElementById('characteristicName').value;
    const type = document.getElementById('characteristicType').value;
    const priority = parseInt(document.getElementById('characteristicPriority').value);
    const unit = document.getElementById('characteristicUnit').value || null;
    const groupId = document.getElementById('characteristicGroupId').value || null;
    const categoryPathText = document.getElementById('characteristicCategoryPath').value;
    const categoryPath = categoryPathText ? categoryPathText.split(' > ').map(s => s.trim()).filter(s => s) : [];
    // Поле фото видалено з інтерфейсу, встановлюємо null
    const photoUrl = null;
    
    // Для типу "brand" використовуємо brand_choices (масив об'єктів), для інших - choices (масив рядків)
    const characteristicChoicesList = window.characteristicChoicesList || [];
    let choices = [];
    let brand_choices = [];
    if (type === 'brand') {
        brand_choices = characteristicChoicesList;
    } else {
        choices = characteristicChoicesList;
    }
    
    try {
        const url = charId ? `/characteristics/${charId}` : '/characteristics';
        const method = charId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, type, priority, unit, group_id: groupId,
                category_path: categoryPath, photo_url: photoUrl, choices, brand_choices
            })
        });
        
        if (!response.ok) throw new Error('Помилка збереження характеристики');
        
        await loadCharacteristics();
        updateCategoryFilter();
        closeCharacteristicModal();
        showToast('✅ Характеристику успішно збережено', 'success');
    } catch (error) {
        showToast(`❌ Помилка: ${error.message}`, 'error');
    }
}

// Збереження значення характеристики
async function saveCharacteristicValue(e) {
    e.preventDefault();
    const productId = getProductId();
    const charId = document.getElementById('characteristicValueCharId').value;
    const value = document.getElementById('characteristicValueValue').value;
    // Поле фото видалено з інтерфейсу, встановлюємо null
    const photoUrl = null;
    
    try {
        const response = await fetch(`/products/${productId}/characteristics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                characteristic_id: charId,
                value: value || null,
                photo_url: photoUrl
            })
        });
        
        if (!response.ok) throw new Error('Помилка збереження значення');
        
        await loadCharacteristics();
        closeCharacteristicValueModal();
        showToast('✅ Значення успішно збережено', 'success');
    } catch (error) {
        showToast(`❌ Помилка: ${error.message}`, 'error');
    }
}

// Закриття модальних вікон
function closeGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
}

function closeCharacteristicModal() {
    document.getElementById('characteristicModal').classList.add('hidden');
}

function closeCharacteristicValueModal() {
    document.getElementById('characteristicValueModal').classList.add('hidden');
}

// Показ toast повідомлень
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        'bg-blue-500 text-white'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Функції openCharacteristicsModal та closeCharacteristicsModal тепер в characteristics.js
// Використовуємо глобальні функції з characteristics.js

// Обробники подій
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOMContentLoaded для product.js ===');
    console.log('Викликаємо loadProduct...');
    loadProduct();
    
    document.getElementById('parseNowBtn')?.addEventListener('click', parseNow);
    document.getElementById('parseFullBtn')?.addEventListener('click', parseFull);
    
    // Обробники для модальних вікон історії та логів
    document.getElementById('showFullHistoryBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('fullHistoryModal');
        if (modal && window.fullHistoryData) {
            displayFullHistory(window.fullHistoryData);
            modal.classList.remove('hidden');
        }
    });
    
    document.getElementById('closeFullHistoryModal')?.addEventListener('click', () => {
        document.getElementById('fullHistoryModal')?.classList.add('hidden');
    });
    
    document.getElementById('closeFullHistoryModalBtn')?.addEventListener('click', () => {
        document.getElementById('fullHistoryModal')?.classList.add('hidden');
    });
    
    document.getElementById('showFullLogsBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('fullLogsModal');
        if (modal && window.fullLogsData) {
            displayFullLogs(window.fullLogsData);
            modal.classList.remove('hidden');
        }
    });
    
    document.getElementById('closeFullLogsModal')?.addEventListener('click', () => {
        document.getElementById('fullLogsModal')?.classList.add('hidden');
    });
    
    document.getElementById('closeFullLogsModalBtn')?.addEventListener('click', () => {
        document.getElementById('fullLogsModal')?.classList.add('hidden');
    });
    
    // Закриття модальних вікон при кліку поза ними
    document.getElementById('fullHistoryModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'fullHistoryModal') {
            e.target.classList.add('hidden');
        }
    });
    
    document.getElementById('fullLogsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'fullLogsModal') {
            e.target.classList.add('hidden');
        }
    });
    
    // Характеристики - відкриття модального вікна (обробники в characteristics.js)
    
    // Характеристики - створення/редагування
    document.getElementById('addGroupBtn')?.addEventListener('click', openAddGroupModal);
    document.getElementById('addCharacteristicBtn')?.addEventListener('click', openAddCharacteristicModal);
    document.getElementById('cancelGroupBtn')?.addEventListener('click', closeGroupModal);
    document.getElementById('cancelCharacteristicBtn')?.addEventListener('click', closeCharacteristicModal);
    document.getElementById('cancelCharacteristicValueBtn')?.addEventListener('click', closeCharacteristicValueModal);
    document.getElementById('groupForm')?.addEventListener('submit', saveGroup);
    document.getElementById('characteristicForm')?.addEventListener('submit', saveCharacteristic);
    document.getElementById('characteristicValueForm')?.addEventListener('submit', saveCharacteristicValue);
    
    // Пошук та фільтри
    document.getElementById('characteristicsSearch')?.addEventListener('input', displayCharacteristics);
    document.getElementById('characteristicsCategoryFilter')?.addEventListener('change', displayCharacteristics);
    
    // Показ поля одиниці виміру для числових характеристик та варіантів
    document.getElementById('characteristicType')?.addEventListener('change', (e) => {
        const unitContainer = document.getElementById('characteristicUnitContainer');
        const choicesContainer = document.getElementById('characteristicChoicesContainer');
        const photoInput = document.getElementById('characteristicChoicePhotoInput');
        const type = e.target.value;
        
        if (type === 'number') {
            unitContainer.style.display = 'block';
        } else {
            unitContainer.style.display = 'none';
        }
        
        if (type === 'choice' || type === 'variation' || type === 'brand') {
            if (choicesContainer) choicesContainer.style.display = 'block';
            if (type === 'brand' && photoInput) {
                photoInput.style.display = 'block';
            } else if (photoInput) {
                photoInput.style.display = 'none';
                photoInput.value = '';
            }
        } else {
            if (choicesContainer) choicesContainer.style.display = 'none';
            if (photoInput) {
                photoInput.style.display = 'none';
                photoInput.value = '';
            }
        }
        
        // Очищаємо список варіантів при зміні типу
        if (window.characteristicChoicesList !== undefined) {
            window.characteristicChoicesList = [];
            if (window.updateCharacteristicChoicesList) {
                window.updateCharacteristicChoicesList();
            }
        }
    });
    
    // Закриття модальних вікон при кліку поза ними
    document.getElementById('characteristicsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'characteristicsModal') closeCharacteristicsModal();
    });
    document.getElementById('groupModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'groupModal') closeGroupModal();
    });
    document.getElementById('characteristicModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'characteristicModal') closeCharacteristicModal();
    });
    document.getElementById('characteristicValueModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'characteristicValueModal') closeCharacteristicValueModal();
    });
});

