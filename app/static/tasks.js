// Система управління фоновим парсингом

let currentTaskId = null;
let pollingInterval = null;

// Ініціалізація системи задач
function initTaskSystem() {
    // Перевіряємо, чи є активна задача при завантаженні сторінки
    checkActiveTasks();
}

// Перевірка активних задач
async function checkActiveTasks() {
    // Це можна розширити для перевірки всіх активних задач
    // Поки що просто перевіряємо currentTaskId
    if (currentTaskId) {
        startPolling(currentTaskId);
    }
}

// Створення задачі на парсинг всіх товарів
async function createParseAllTask() {
    try {
        const response = await fetch('/tasks/parse_products', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        currentTaskId = data.task_id;
        
        // Показуємо прогрес-бар
        showTaskProgress('Парсинг всіх товарів...');
        startPolling(currentTaskId);
        
        // Блокуємо UI
        setParsingActive(true);
        
        return data.task_id;
    } catch (error) {
        console.error('Помилка створення задачі:', error);
        showToast('Помилка створення задачі: ' + error.message, 'error');
        throw error;
    }
}

// Створення задачі на парсинг одного товару
async function createParseProductTask(productId) {
    try {
        const response = await fetch(`/tasks/parse_product/${productId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        currentTaskId = data.task_id;
        
        // Показуємо прогрес-бар
        showTaskProgress('Парсинг товару...');
        startPolling(currentTaskId);
        
        // Блокуємо UI
        setParsingActive(true);
        
        return data.task_id;
    } catch (error) {
        console.error('Помилка створення задачі:', error);
        showToast('Помилка створення задачі: ' + error.message, 'error');
        throw error;
    }
}

// Створення задачі на повний парсинг одного товару (як "Парсинг всіх даних")
async function createParseProductFullTask(productId) {
    try {
        const response = await fetch(`/tasks/parse_product_full/${productId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        currentTaskId = data.task_id;
        
        // Показуємо прогрес-бар
        showTaskProgress('Парсинг всіх даних товару...');
        startPolling(currentTaskId);
        
        // Блокуємо UI
        setParsingActive(true);
        
        return data.task_id;
    } catch (error) {
        console.error('Помилка створення задачі:', error);
        showToast('Помилка створення задачі: ' + error.message, 'error');
        throw error;
    }
}

// Створення задачі на парсинг категорій конкурента
async function createParseCategoriesTask(competitorId) {
    try {
        const response = await fetch(`/tasks/parse_categories/${competitorId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        currentTaskId = data.task_id;
        
        // Показуємо прогрес-бар
        showTaskProgress('Парсинг категорій...');
        startPolling(currentTaskId);
        
        // Блокуємо UI
        setParsingActive(true);
        
        return data.task_id;
    } catch (error) {
        console.error('Помилка створення задачі:', error);
        showToast('Помилка створення задачі: ' + error.message, 'error');
        throw error;
    }
}

// Створення задачі на оновлення категорій конкурента
async function createUpdateCategoriesTask(competitorId) {
    try {
        const response = await fetch(`/tasks/update_categories/${competitorId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        currentTaskId = data.task_id;
        
        // Показуємо прогрес-бар
        showTaskProgress('Оновлення категорій...');
        startPolling(currentTaskId);
        
        // Блокуємо UI
        setParsingActive(true);
        
        return data.task_id;
    } catch (error) {
        console.error('Помилка створення задачі:', error);
        showToast('Помилка створення задачі: ' + error.message, 'error');
        throw error;
    }
}

// Створення задачі на пошук товарів у вибраних категоріях
async function createDiscoverProductsTask(competitorId, categoryIds) {
    try {
        const response = await fetch('/tasks/discover_products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                competitor_id: competitorId,
                category_ids: categoryIds
            })
        });
        
        if (!response.ok) {
            throw new Error('Помилка створення задачі');
        }
        
        const data = await response.json();
        currentTaskId = data.task_id;
        
        // Показуємо прогрес-бар
        showTaskProgress('Пошук товарів у категоріях...');
        startPolling(currentTaskId);
        
        // Блокуємо UI
        setParsingActive(true);
        
        return data.task_id;
    } catch (error) {
        console.error('Помилка створення задачі:', error);
        showToast('Помилка створення задачі: ' + error.message, 'error');
        throw error;
    }
}

// Початок polling статусу задачі
function startPolling(taskId) {
    // Зупиняємо попередній polling, якщо він є
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    // Невелика затримка перед початком polling, щоб дати час задачі ініціалізуватися
    setTimeout(() => {
        // Починаємо новий polling
        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`/tasks/status/${taskId}`);
                
                // Якщо 404, задача ще не створена або видалена - не показуємо помилку одразу
                if (response.status === 404) {
                    console.warn(`Задача ${taskId} не знайдена, чекаємо...`);
                    return; // Продовжуємо polling
                }
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Помилка отримання статусу (${response.status}):`, errorText);
                    // Не зупиняємо polling при помилках сервера, продовжуємо спроби
                    return;
                }
                
                const status = await response.json();
                updateTaskProgress(status);
                
                // Якщо задача завершена, зупиняємо polling
                if (status.status === 'finished' || status.status === 'failed') {
                    stopPolling();
                    handleTaskComplete(status);
                }
            } catch (error) {
                console.error('Помилка polling:', error);
                // Не зупиняємо polling при мережевих помилках, продовжуємо спроби
                // Тільки показуємо попередження в консолі
            }
        }, 1500); // Оновлюємо кожні 1.5 секунди
    }, 500); // Затримка 500мс перед початком polling
}

// Зупинка polling
function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// Оновлення прогрес-бару
function updateTaskProgress(status) {
    const progressBar = document.getElementById('task-bar');
    const progressLabel = document.getElementById('task-label');
    const taskProgress = document.getElementById('task-progress');
    
    if (!progressBar || !progressLabel || !taskProgress) {
        return;
    }
    
    const total = status.total || 1;
    const done = status.done || 0;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    
    // Оновлюємо текст
    progressLabel.textContent = `Виконано: ${done} з ${total} (${percentage}%)`;
    
    // Оновлюємо прогрес-бар
    progressBar.style.width = `${percentage}%`;
    
    // Змінюємо колір в залежності від статусу
    if (status.status === 'finished') {
        progressBar.className = 'bg-green-600 h-2 rounded-full transition-all duration-300';
    } else if (status.status === 'failed') {
        progressBar.className = 'bg-red-600 h-2 rounded-full transition-all duration-300';
    } else {
        progressBar.className = 'bg-blue-600 h-2 rounded-full transition-all duration-300';
    }
    
    // Показуємо прогрес-бар, якщо він прихований
    if (taskProgress.classList.contains('hidden')) {
        taskProgress.classList.remove('hidden');
    }
}

// Показ прогрес-бару
function showTaskProgress(label) {
    const taskProgress = document.getElementById('task-progress');
    const progressLabel = document.getElementById('task-label');
    
    if (taskProgress) {
        taskProgress.classList.remove('hidden');
    }
    
    if (progressLabel) {
        progressLabel.textContent = label || 'Виконання задачі...';
    }
    
    // Показуємо глобальний індикатор
    showGlobalIndicator(true);
}

// Приховування прогрес-бару
function hideTaskProgress() {
    const taskProgress = document.getElementById('task-progress');
    if (taskProgress) {
        // Затримка перед приховуванням (3 секунди)
        setTimeout(() => {
            taskProgress.classList.add('hidden');
        }, 3000);
    }
    
    // Приховуємо глобальний індикатор
    showGlobalIndicator(false);
}

// Обробка завершення задачі
async function handleTaskComplete(status) {
    // Розблоковуємо UI
    setParsingActive(false);
    
    if (status.status === 'finished') {
        const errors = status.errors || [];
        
        // Перевіряємо, чи це задача discover_products (перевіряємо наявність кнопки)
        const discoverBtn = document.getElementById('discover-products-btn');
        const isDiscoverTask = discoverBtn && !discoverBtn.classList.contains('hidden');
        
        if (isDiscoverTask) {
            // Отримуємо кількість знайдених товарів з API
            let productsCount = 0;
            try {
                const taskResponse = await fetch(`/tasks/status/${currentTaskId}`);
                if (taskResponse.ok) {
                    const taskData = await taskResponse.json();
                    productsCount = taskData.products_found || 0;
                    console.log(`Отримано products_found з API: ${productsCount}`);
                } else {
                    console.warn(`Не вдалося отримати статус задачі: ${taskResponse.status}`);
                }
            } catch (e) {
                console.error('Помилка отримання кількості товарів:', e);
            }
            
            // Спеціальна обробка для discover_products
            const total = status.total || 0;
            const done = status.done || 0;
            let message = `✅ Товари знайдено та додано\nОброблено ${done} з ${total} категорій`;
            if (productsCount > 0) {
                message += `\nЗнайдено товарів: ${productsCount}`;
            } else {
                message += `\n⚠️ УВАГА: Товари не знайдені або не збережені!`;
                message += `\nПеревірте логи сервера для деталей.`;
            }
            message += '\n\nПерейдіть на сторінку "Товари" для перегляду.';
            
            // Показуємо toast з можливістю перейти на головну сторінку
            showToastWithLink(message, productsCount > 0 ? 'success' : 'error', '/', 'Перейти до товарів');
            
            // Ховаємо кнопку "Знайти товари"
            discoverBtn.classList.add('hidden');
            discoverBtn.disabled = false;
            discoverBtn.textContent = 'Знайти товари у вибраних категоріях';
            
            // Скидаємо всі чекбокси
            const checkboxes = document.querySelectorAll('.category-select');
            checkboxes.forEach(cb => cb.checked = false);
            
            // Оновлюємо список товарів на головній сторінці (якщо функція існує)
            if (typeof loadProducts === 'function') {
                loadProducts();
            } else {
                // Якщо ми не на головній сторінці, показуємо повідомлення з посиланням
                console.log('Функція loadProducts не знайдена. Користувач не на головній сторінці.');
            }
        } else {
            // Перевіряємо, чи це задача update_categories
            const taskType = status.type || '';
            if (taskType === 'update_categories') {
                // Спеціальна обробка для оновлення категорій
                // Статистика зберігається в полі error (це не помилка, а інформація)
                const statsMessage = status.errors && status.errors.length > 0 ? status.errors[status.errors.length - 1] : '';
                if (statsMessage && statsMessage.includes('Оновлення завершено')) {
                    // Показуємо статистику оновлення
                    showToast(statsMessage, 'success');
                } else {
                    showToast('✅ Оновлення категорій завершено\nДані успішно оновлені.', 'success');
                }
                
                // Оновлюємо дерево категорій
                if (typeof loadCompetitor === 'function') {
                    loadCompetitor();
                }
            } else {
                // Звичайна обробка для інших задач
                if (errors.length > 0) {
                    // Є помилки, але задача завершена (частковий успіх)
                    let message = '✅ Оновлення завершено\n';
                    message += `Успішно: ${status.done - errors.length}\n`;
                    message += `Помилок: ${errors.length}`;
                    if (errors.length <= 3) {
                        message += '\n\nПомилки:\n' + errors.join('\n');
                    }
                    showToast(message, 'error');
                } else {
                    // Всі успішні
                    showToast('✅ Оновлення завершено\nДані успішно оновлені.', 'success');
                }
            }
        }
        
        hideTaskProgress();
        
        // Відновлюємо кнопки після завершення задачі
        restoreButtons();
        
        // Оновлюємо дані на сторінці (якщо потрібно)
        if (typeof loadProducts === 'function') {
            // Якщо є функція applyFilters, використовуємо її для збереження фільтрів
            if (typeof applyFilters === 'function') {
                applyFilters();
            } else {
                loadProducts();
            }
        }
        if (typeof loadProduct === 'function') {
            loadProduct();
        }
        if (typeof loadCompetitor === 'function') {
            loadCompetitor();
        }
        if (typeof loadCompetitors === 'function') {
            loadCompetitors();
        }
        
        // Скидаємо checkbox на сторінці товарів
        if (typeof document !== 'undefined') {
            const checkboxes = document.querySelectorAll('.product-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
            const selectAll = document.getElementById('select-all');
            if (selectAll) selectAll.checked = false;
        }
    } else if (status.status === 'failed') {
        const errors = status.errors || [];
        let errorMessage = '❌ Парсинг завершено з помилками\n';
        
        if (errors.length > 0) {
            errorMessage += `Помилок: ${errors.length}\n`;
            if (errors.length <= 3) {
                errorMessage += errors.join('\n');
            } else {
                errorMessage += errors.slice(0, 3).join('\n') + `\n... та ще ${errors.length - 3} помилок`;
            }
        } else {
            errorMessage += 'Перегляньте лог для деталей.';
        }
        
        showToast(errorMessage, 'error');
        
        // Відновлюємо кнопки навіть при помилці
        restoreButtons();
        
        // Не приховуємо прогрес-бар одразу, щоб користувач міг побачити помилки
        setTimeout(() => {
            hideTaskProgress();
        }, 5000);
    }
    
    currentTaskId = null;
}

// Показ глобального індикатора
function showGlobalIndicator(show) {
    const indicator = document.getElementById('global-parsing-indicator');
    if (indicator) {
        if (show) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    }
}

// Блокування/розблоковування UI
function setParsingActive(active) {
    if (active) {
        document.body.classList.add('parsing-active');
    } else {
        document.body.classList.remove('parsing-active');
    }
}

// Toast повідомлення
function showToast(message, type = 'info') {
    // Створюємо елемент toast
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md transition-all duration-300 transform translate-x-0`;
    
    // Встановлюємо стиль в залежності від типу
    if (type === 'success') {
        toast.className += ' bg-green-50 border border-green-200 text-green-800';
    } else if (type === 'error') {
        toast.className += ' bg-red-50 border border-red-200 text-red-800';
    } else {
        toast.className += ' bg-blue-50 border border-blue-200 text-blue-800';
    }
    
    // Додаємо текст (з підтримкою переносів рядків)
    const lines = message.split('\n');
    toast.innerHTML = lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');
    
    // Додаємо кнопку закриття
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl font-bold';
    closeBtn.onclick = () => toast.remove();
    toast.appendChild(closeBtn);
    
    // Додаємо до DOM
    document.body.appendChild(toast);
    
    // Автоматично видаляємо через 5 секунд
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Toast повідомлення з посиланням
function showToastWithLink(message, type = 'info', linkUrl = '', linkText = 'Перейти') {
    // Створюємо елемент toast
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md transition-all duration-300 transform translate-x-0`;
    
    // Встановлюємо стиль в залежності від типу
    if (type === 'success') {
        toast.className += ' bg-green-50 border border-green-200 text-green-800';
    } else if (type === 'error') {
        toast.className += ' bg-red-50 border border-red-200 text-red-800';
    } else {
        toast.className += ' bg-blue-50 border border-blue-200 text-blue-800';
    }
    
    // Додаємо текст (з підтримкою переносів рядків)
    const lines = message.split('\n');
    const messageHtml = lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');
    
    // Додаємо кнопку посилання, якщо вказано
    let linkHtml = '';
    if (linkUrl) {
        linkHtml = `<div class="mt-3"><a href="${linkUrl}" class="inline-block bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition">${escapeHtml(linkText)}</a></div>`;
    }
    
    toast.innerHTML = messageHtml + linkHtml;
    
    // Додаємо кнопку закриття
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl font-bold';
    closeBtn.onclick = () => toast.remove();
    toast.appendChild(closeBtn);
    
    // Додаємо до DOM
    document.body.appendChild(toast);
    
    // Автоматично видаляємо через 10 секунд (більше часу, якщо є посилання)
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, linkUrl ? 10000 : 5000);
}

// Відновлення кнопок після завершення задачі
function restoreButtons() {
    // Відновлюємо кнопку "Спарсити все"
    const parseAllBtn = document.getElementById('parseAllBtn');
    if (parseAllBtn) {
        parseAllBtn.disabled = false;
        parseAllBtn.textContent = '🔄 Спарсити все';
    }
    
    // Відновлюємо кнопку "Парсити знайдене"
    const parseFoundBtn = document.getElementById('parse-found-btn');
    if (parseFoundBtn) {
        parseFoundBtn.disabled = false;
        parseFoundBtn.textContent = '🔍 Парсити знайдене';
    }
    
    // Відновлюємо кнопку "Парсити вибране"
    const parseSelectedBtn = document.getElementById('parse-selected-btn');
    if (parseSelectedBtn) {
        parseSelectedBtn.disabled = false;
        parseSelectedBtn.textContent = '✅ Парсити вибране';
    }
    
    // Відновлюємо кнопки "Спарсити" для окремих товарів
    const parseButtons = document.querySelectorAll('.parse-product-btn');
    parseButtons.forEach(btn => {
        if (btn.textContent.includes('В процесі')) {
            btn.disabled = false;
            btn.textContent = 'Спарсити';
        }
    });
    
    // Відновлюємо кнопки на сторінці товару
    const parseNowBtn = document.getElementById('parseNowBtn');
    if (parseNowBtn && parseNowBtn.textContent.includes('В процесі')) {
        parseNowBtn.disabled = false;
        parseNowBtn.textContent = 'Спарсити зараз';
    }
    
    const parseFullBtn = document.getElementById('parseFullBtn');
    if (parseFullBtn && parseFullBtn.textContent.includes('В процесі')) {
        parseFullBtn.disabled = false;
        parseFullBtn.textContent = 'Парсинг всіх даних';
    }
    
    // Відновлюємо кнопки на сторінці конкурента
    const parseCategoriesBtn = document.getElementById('parseCategoriesBtn');
    if (parseCategoriesBtn && parseCategoriesBtn.textContent.includes('В процесі')) {
        parseCategoriesBtn.disabled = false;
        parseCategoriesBtn.textContent = 'Спарсити категорії';
    }
    
    const updateCategoriesBtn = document.getElementById('updateCategoriesBtn');
    if (updateCategoriesBtn && updateCategoriesBtn.textContent.includes('В процесі')) {
        updateCategoriesBtn.disabled = false;
        updateCategoriesBtn.textContent = 'Оновити категорії';
    }
    
    // Відновлюємо фільтри
    const filterInputs = document.querySelectorAll('#filter-name, #filter-price-from, #filter-price-to');
    filterInputs.forEach(input => input.disabled = false);
    
    const filterSelects = document.querySelectorAll('#filter-competitor, #filter-category, #filter-status, #filter-availability');
    filterSelects.forEach(select => select.disabled = false);
    
    const filterCheckbox = document.getElementById('filter-problematic');
    if (filterCheckbox) filterCheckbox.disabled = false;
    
    // Відновлюємо checkbox товарів
    const productCheckboxes = document.querySelectorAll('.product-checkbox');
    productCheckboxes.forEach(cb => cb.disabled = false);
    
    const selectAll = document.getElementById('select-all');
    if (selectAll) selectAll.disabled = false;
}

// Екранування HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    initTaskSystem();
});

