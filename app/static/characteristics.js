// ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ХАРАКТЕРИСТИКАМИ (ГЛОБАЛЬНІ) ==========

let characteristicsData = [];
let groupsData = [];
let currentProductId = null;

// Встановлення ID поточного товару (якщо є)
function setCurrentProductId(productId) {
    currentProductId = productId;
}

// Експортуємо функції в window ОДРАЗУ після визначення
window.setCurrentProductId = setCurrentProductId;

// Отримання ID товару з URL (якщо ми на сторінці товару)
function getProductIdFromUrl() {
    const path = window.location.pathname;
    console.log('getProductIdFromUrl: path =', path);
    const match = path.match(/\/product\/([^\/]+)/);
    console.log('getProductIdFromUrl: match =', match);
    const productId = match ? match[1] : null;
    console.log('getProductIdFromUrl: productId =', productId);
    return productId;
}

// Експортуємо loadCharacteristics одразу після визначення (якщо вже визначено)
// Якщо функція ще не визначена, вона буде експортована в кінці файлу

// Завантаження характеристик для товару
async function loadCharacteristics() {
    const productId = currentProductId || getProductIdFromUrl();
    const contentEl = document.getElementById('characteristicsContent');
    
    if (!contentEl) {
        console.warn('Елемент characteristicsContent не знайдено');
        return;
    }
    
    if (!productId) {
        console.warn('ID товару не знайдено для завантаження характеристик');
        contentEl.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <p class="mb-2">Для перегляду характеристик товару відкрийте картку товару.</p>
                <p class="text-sm">Ви можете створювати групи та характеристики, які будуть доступні для всіх товарів.</p>
            </div>`;
        // Завантажуємо тільки групи та характеристики (без значень товару)
        await loadGroups();
        await displayAllCharacteristics();
        return;
    }
    
    try {
        console.log('Завантаження характеристик для товару:', productId);
        const response = await fetch(`/products/${productId}/characteristics`);
        console.log('Відповідь отримано:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Помилка відповіді:', errorText);
            throw new Error(`Помилка завантаження характеристик: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Дані характеристик отримано:', data);
        characteristicsData = data.characteristics || [];
        console.log('Кількість характеристик:', characteristicsData.length);
        
        if (characteristicsData.length === 0) {
            console.warn('Характеристики не знайдено для товару');
            if (contentEl) {
                contentEl.innerHTML = '<div class="text-center text-gray-500 py-8">Характеристики відсутні. Додайте характеристики для цього товару.</div>';
            }
            return;
        }
        
        updateCategoryFilter();
        await displayCharacteristics();
    } catch (error) {
        console.error('Помилка завантаження характеристик:', error);
        if (contentEl) {
            contentEl.innerHTML = 
                `<div class="text-center text-red-500 py-8">Помилка завантаження характеристик: ${error.message}</div>`;
        }
    }
}

// Експортуємо loadCharacteristics одразу після визначення
window.loadCharacteristics = loadCharacteristics;

// Завантаження груп характеристик
async function loadGroups() {
    try {
        const response = await fetch('/characteristics/groups');
        if (!response.ok) throw new Error('Помилка завантаження груп');
        
        const data = await response.json();
        groupsData = data.groups || [];
        updateGroupSelects();
    } catch (error) {
        console.error('Помилка завантаження груп:', error);
    }
}

// Оновлення select з групами
function updateGroupSelects() {
    const select = document.getElementById('characteristicGroupId');
    if (!select) return;
    
    select.innerHTML = '<option value="">Без групи</option>';
    groupsData.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        select.appendChild(option);
    });
}

// Оновлення фільтра категорій
async function updateCategoryFilter() {
    const select = document.getElementById('characteristicsCategoryFilter');
    if (!select) return;
    
    // Збираємо всі унікальні категорії з характеристик
    const categories = new Set();
    
    if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
        // На сторінці характеристик - завантажуємо всі характеристики
        try {
            const response = await fetch('/characteristics');
            if (response.ok) {
                const data = await response.json();
                const allCharacteristics = data.characteristics || [];
                allCharacteristics.forEach(char => {
                    const charCategories = char.category_path || [];
                    charCategories.forEach(cat => categories.add(cat));
                });
            }
        } catch (error) {
            console.error('Помилка завантаження характеристик для фільтра:', error);
        }
    } else {
        // На інших сторінках - використовуємо characteristicsData
        characteristicsData.forEach(char => {
            const charCategories = char.category_path || [];
            charCategories.forEach(cat => categories.add(cat));
        });
    }
    
    // Оновлюємо select
    const currentValue = select.value;
    select.innerHTML = '<option value="">Всі категорії</option>';
    Array.from(categories).sort().forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
    
    // Відновлюємо вибране значення
    if (currentValue) {
        select.value = currentValue;
    }
}

// Відображення характеристик
async function displayCharacteristics() {
    const container = document.getElementById('characteristicsContent');
    if (!container) {
        console.warn('Елемент characteristicsContent не знайдено');
        return;
    }
    
    // Переконуємося, що модальне вікно характеристик видиме (якщо воно відкрите)
    const modal = document.getElementById('characteristicsModal');
    if (modal && !modal.classList.contains('hidden')) {
        // Модальне вікно вже відкрите, нічого не робимо
    }
    
    console.log('=== ВІДОБРАЖЕННЯ ХАРАКТЕРИСТИК ===');
    console.log('Кількість характеристик:', characteristicsData.length);
    console.log('Дані характеристик:', characteristicsData);
    
    if (characteristicsData.length === 0) {
        console.warn('Немає даних для відображення');
        container.innerHTML = '<div class="text-center text-gray-500 py-8">Характеристики відсутні. Додайте характеристики для цього товару.</div>';
        return;
    }
    
    // Фільтрація
    const searchText = document.getElementById('characteristicsSearch')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('characteristicsCategoryFilter')?.value || '';
    
    let filtered = characteristicsData;
    if (searchText) {
        filtered = filtered.filter(char => char.name.toLowerCase().includes(searchText));
    }
    if (categoryFilter) {
        filtered = filtered.filter(char => {
            const charCategories = char.category_path || [];
            return charCategories.includes(categoryFilter);
        });
    }
    
    // Групування за групами
    const grouped = {};
    filtered.forEach(char => {
        const groupId = char.group_id || 'no-group';
        if (!grouped[groupId]) {
            grouped[groupId] = {
                group: char.group || null,
                characteristics: []
            };
        }
        grouped[groupId].characteristics.push(char);
    });
    
    // Сортування груп за пріоритетом
    const sortedGroups = Object.keys(grouped).sort((a, b) => {
        const groupA = grouped[a].group;
        const groupB = grouped[b].group;
        if (!groupA && !groupB) return 0;
        if (!groupA) return 1;
        if (!groupB) return -1;
        // Спочатку сортуємо за пріоритетом
        const priorityA = groupA.priority || 2;
        const priorityB = groupB.priority || 2;
        if (priorityA !== priorityB) return priorityA - priorityB;
        // Якщо пріоритети однакові, сортуємо за назвою
        return (groupA.name || '').localeCompare(groupB.name || '');
    });
    
    // Сортування характеристик за пріоритетом
    sortedGroups.forEach(groupId => {
        grouped[groupId].characteristics.sort((a, b) => {
            const priorityA = a.priority || 2;
            const priorityB = b.priority || 2;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return (a.name || '').localeCompare(b.name || '');
        });
    });
    
    // Рендеринг (спочатку відображаємо, потім перевіряємо значення)
    let html = '';
    sortedGroups.forEach(groupId => {
        const groupData = grouped[groupId];
        const group = groupData.group;
        
        if (group) {
            html += `<div class="mb-6 border border-gray-200 rounded-lg p-4">`;
            html += `<h4 class="text-lg font-semibold text-[#1f2937] mb-3">${escapeHtml(group.name)}</h4>`;
            if (group.description) {
                html += `<p class="text-sm text-gray-600 mb-3">${escapeHtml(group.description)}</p>`;
            }
        } else {
            html += `<div class="mb-6">`;
        }
        
        html += `<div class="space-y-3">`;
        groupData.characteristics.forEach(char => {
            const value = char.value !== null && char.value !== undefined ? char.value : '';
            const hasValue = value !== '';
            
            html += `<div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">`;
            // Назва характеристики (ліворуч)
            html += `<div class="flex-shrink-0 w-48">`;
            html += `<div class="flex items-center gap-2">`;
            html += `<span class="font-medium text-gray-800">${escapeHtml(char.name)}</span>`;
            if (char.unit) {
                html += `<span class="text-sm text-gray-500">(${escapeHtml(char.unit)})</span>`;
            }
            html += `</div>`;
            html += `</div>`;
            
            // Поле значення (праворуч)
            html += `<div class="flex-1">`;
            // Відображення значення або вибору варіантів
            if (char.type === 'choice' || char.type === 'variation' || char.type === 'brand') {
                // Для типу "brand" використовуємо brand_choices (масив об'єктів), для інших - choices (масив рядків)
                let choices = [];
                if (char.type === 'brand') {
                    choices = (char.brand_choices || []).map(bc => typeof bc === 'object' ? bc.name : bc);
                } else {
                    choices = char.choices || [];
                }
                const isMultiple = char.type === 'variation';
                const currentValues = hasValue ? value.split(',').map(v => v.trim()).filter(v => v) : [];
                
                if (isMultiple) {
                    // Variation тип - multi-select з тегами
                    const charId = char.id;
                    html += `<div class="char-variation-select-container" data-char-id="${charId}">`;
                    // Контейнер для тегів обраних варіантів
                    html += `<div class="char-variation-tags flex flex-wrap gap-2 mb-2 min-h-[2.5rem]">`;
                    currentValues.forEach(selectedValue => {
                        html += `<span class="char-variation-tag inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm border border-blue-300">`;
                        html += `<span>${escapeHtml(selectedValue)}</span>`;
                        html += `<button type="button" class="char-variation-remove text-blue-600 hover:text-blue-800 font-bold" data-value="${escapeHtml(selectedValue)}" title="Видалити">&times;</button>`;
                        html += `</span>`;
                    });
                    html += `</div>`;
                    // Поле вводу з dropdown
                    html += `<div class="relative">`;
                    html += `<input type="text" 
                             data-char-id="${charId}" 
                             data-char-name="${escapeHtml(char.name)}"
                             class="char-variation-input w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                             placeholder="${choices.length > 0 ? '-- Оберіть варіант --' : 'Варіанти не налаштовані'}"
                             autocomplete="off"
                             ${choices.length === 0 ? 'disabled' : ''}>`;
                    html += `<div class="char-dropdown-icon absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">`;
                    html += `<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">`;
                    html += `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>`;
                    html += `</svg>`;
                    html += `</div>`;
                    // Dropdown зі списком варіантів
                    html += `<div class="char-variation-dropdown hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">`;
                    if (choices.length > 0) {
                        choices.forEach(choice => {
                            const isSelected = currentValues.includes(choice);
                            html += `<div class="char-variation-option px-3 py-2 cursor-pointer hover:bg-blue-50 ${isSelected ? 'bg-gray-100 text-gray-600' : ''}" data-value="${escapeHtml(choice)}">${escapeHtml(choice)}</div>`;
                        });
                    } else {
                        html += `<div class="char-variation-option px-3 py-2 text-gray-500 text-sm italic" style="pointer-events: none;">Варіанти відсутні</div>`;
                    }
                    html += `</div>`;
                    html += `</div>`;
                    html += `</div>`;
                } else {
                    // Choice тип - select з пошуком
                    const charId = char.id;
                    // Якщо є варіанти, але поточне значення не відповідає жодному варіанту, очищаємо його
                    let currentValue = value || '';
                    if (choices.length > 0 && currentValue && !choices.includes(currentValue.trim())) {
                        // Значення не відповідає жодному варіанту - очищаємо
                        const productId = currentProductId || getProductIdFromUrl();
                        if (productId) {
                            // Очищаємо значення асинхронно (не блокуємо рендеринг)
                            saveCharacteristicValueFromInput(productId, charId, null, false).catch(err => {
                                console.error('Помилка очищення значення:', err);
                            });
                        }
                        currentValue = '';
                    }
                    
                    // Для choice типу завжди показуємо searchable select (навіть якщо немає варіантів)
                    // Це дозволяє додавати нові варіанти прямо з картки товару
                    html += `<div class="char-searchable-select-container" data-char-id="${charId}">`;
                    html += `<div class="flex gap-2 items-center">`;
                    html += `<div class="flex-1 relative">`;
                    html += `<input type="text" 
                             data-char-id="${charId}" 
                             data-char-name="${escapeHtml(char.name)}"
                             class="char-searchable-input w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                             value="${escapeHtml(currentValue)}" 
                             placeholder="${choices.length > 0 ? '-- Оберіть варіант --' : 'Введіть значення та натисніть "Додати"'}"
                             autocomplete="off">`;
                    html += `<div class="char-dropdown-icon absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">`;
                    html += `<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">`;
                    html += `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>`;
                    html += `</svg>`;
                    html += `</div>`;
                    html += `<div class="char-dropdown-list hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">`;
                    if (choices.length > 0) {
                        const brandChoices = char.type === 'brand' ? (char.brand_choices || []) : [];
                        choices.forEach(choice => {
                            const isSelected = currentValue === choice;
                            // Для типу "brand" шукаємо фото для цього варіанту
                            let photoUrl = null;
                            if (char.type === 'brand') {
                                const brandChoice = brandChoices.find(bc => (typeof bc === 'object' ? bc.name : bc) === choice);
                                if (brandChoice && typeof brandChoice === 'object') {
                                    photoUrl = brandChoice.photo_url || null;
                                }
                            }
                            html += `<div class="char-dropdown-option px-3 py-2 cursor-pointer hover:bg-blue-50 ${isSelected ? 'bg-blue-100' : ''} flex items-center gap-2" data-value="${escapeHtml(choice)}">`;
                            if (photoUrl) {
                                html += `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(choice)}" class="w-6 h-6 rounded border border-gray-300 object-cover">`;
                            }
                            html += `<span>${escapeHtml(choice)}</span>`;
                            html += `</div>`;
                        });
                    } else {
                        html += `<div class="char-dropdown-option px-3 py-2 text-gray-500 text-sm italic" style="pointer-events: none;">Варіанти відсутні. Введіть значення та натисніть "Додати"</div>`;
                    }
                    html += `</div>`;
                    html += `</div>`;
                    // Кнопка "Додати" для нового варіанту (показуємо, якщо введено значення, якого немає в списку, або якщо список порожній)
                    html += `<button type="button" class="char-add-choice-btn hidden px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition whitespace-nowrap ml-2" data-char-id="${charId}">Додати</button>`;
                    html += `</div>`;
                    html += `</div>`;
                }
            } else if (char.type === 'number') {
                // Number тип - поле вводу для чисел
                const charId = char.id;
                const numericValue = hasValue ? parseFloat(value) : '';
                const unit = char.unit ? ` ${escapeHtml(char.unit)}` : '';
                html += `<input type="number" 
                         data-char-id="${charId}" 
                         data-char-name="${escapeHtml(char.name)}"
                         class="char-number-input w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                         value="${numericValue}" 
                         placeholder="Введіть число${unit}"
                         step="any">`;
            } else if (char.type === 'text') {
                // Text тип - поле вводу для тексту
                const charId = char.id;
                html += `<input type="text" 
                         data-char-id="${charId}" 
                         data-char-name="${escapeHtml(char.name)}"
                         class="char-text-input w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                         value="${escapeHtml(value)}" 
                         placeholder="Введіть текст">`;
            } else if (hasValue) {
                html += `<div class="flex items-center gap-2">`;
                if (char.photo_url) {
                    html += `<img src="${escapeHtml(char.photo_url)}" alt="${escapeHtml(char.name)}" class="w-8 h-8 rounded border border-gray-300">`;
                }
                html += `<span class="text-gray-700">${escapeHtml(value)}</span>`;
                html += `</div>`;
            } else {
                html += `<span class="text-gray-400 italic">Значення не встановлено</span>`;
            }
            
            // Для choice, variation, brand, number та text типів не показуємо кнопку "Додати значення"
            // Для інших типів показуємо кнопку редагування
            if (char.type !== 'choice' && char.type !== 'variation' && char.type !== 'brand' && char.type !== 'number' && char.type !== 'text') {
                html += `<div class="flex gap-2 mt-2">`;
                html += `<button data-char-id="${char.id}" data-char-name="${escapeHtml(char.name)}" data-char-type="${escapeHtml(char.type)}" data-char-value="${escapeHtml(value || '')}" data-char-photo="${escapeHtml(char.photo_url || '')}" 
                         class="edit-char-value-btn px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition">
                         ${hasValue ? 'Редагувати' : 'Додати значення'}
                         </button>`;
                html += `</div>`;
            }
            html += `</div>`;
            
            // Додаємо кнопки редагування та видалення для характеристик (якщо на сторінці характеристик)
            if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
                html += `<div class="flex-shrink-0">`;
                html += `<div class="flex gap-2">`;
                html += `<button onclick="window.openEditCharacteristicModal('${char.id}')" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition">Редагувати</button>`;
                html += `<button onclick="window.deleteCharacteristic('${char.id}')" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition">Видалити</button>`;
                html += `</div>`;
                html += `</div>`;
            }
            html += `</div>`;
        });
        html += `</div>`;
        html += `</div>`;
    });
    
    container.innerHTML = html;
    
    // Додаємо обробники подій для searchable select (choice тип)
    container.querySelectorAll('.char-searchable-select-container').forEach(container => {
        const input = container.querySelector('.char-searchable-input');
        const dropdown = container.querySelector('.char-dropdown-list');
        const options = container.querySelectorAll('.char-dropdown-option');
        const charId = container.dataset.charId;
        
        // Відкриття/закриття dropdown
        input.addEventListener('focus', () => {
            dropdown.classList.remove('hidden');
            filterDropdownOptions(input, options);
        });
        
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            // Завжди показуємо dropdown при кліку, навіть якщо поле заповнене
            input.removeAttribute('readonly');
            dropdown.classList.remove('hidden');
            filterDropdownOptions(input, options);
        });
        
        // Пошук при введенні тексту (знімаємо readonly для пошуку)
        // Кнопка знаходиться в батьківському контейнері (flex gap-2 items-start)
        const parentContainer = container.closest('.char-searchable-select-container')?.parentElement || container.parentElement;
        const addButton = parentContainer?.querySelector(`.char-add-choice-btn[data-char-id="${charId}"]`) || container.querySelector(`.char-add-choice-btn[data-char-id="${charId}"]`);
        
        if (!addButton) {
            console.error('Кнопка "Додати" не знайдена для характеристики:', charId);
            console.log('Контейнер:', container);
            console.log('Батьківський контейнер:', parentContainer);
            console.log('Всі кнопки:', parentContainer?.querySelectorAll('button') || container.querySelectorAll('button'));
        }
        
        input.addEventListener('mousedown', (e) => {
            // Завжди знімаємо readonly при кліку, щоб можна було вибрати варіант
            if (input.hasAttribute('readonly')) {
                e.preventDefault();
                input.removeAttribute('readonly');
                input.focus();
                dropdown.classList.remove('hidden');
                filterDropdownOptions(input, options);
            }
        });
        
        // Обробник для введення тексту
        const handleInput = () => {
            const inputValue = input.value.trim();
            filterDropdownOptions(input, options);
            dropdown.classList.remove('hidden');
            
            if (!addButton) {
                console.error('Кнопка "Додати" не знайдена для характеристики:', charId);
                return;
            }
            
            // Фільтруємо опції, виключаючи повідомлення про відсутність варіантів
            const realOptions = Array.from(options).filter(opt => opt.dataset.value);
            
            // Перевіряємо, чи введене значення є в списку варіантів
            // Якщо немає варіантів (realOptions.length === 0), то isValidChoice завжди false
            const isValidChoice = realOptions.length > 0 && realOptions.some(opt => {
                return opt.dataset.value && opt.dataset.value.toLowerCase() === inputValue.toLowerCase();
            });
            
            // Якщо значення введено і його немає в списку (або список порожній) - показуємо кнопку "Додати"
            if (inputValue && (!isValidChoice || realOptions.length === 0)) {
                addButton.classList.remove('hidden');
            } else {
                addButton.classList.add('hidden');
            }
        };
        
        input.addEventListener('input', handleInput);
        input.addEventListener('keyup', handleInput);
        
        // Також показуємо кнопку при фокусі, якщо є значення
        input.addEventListener('focus', () => {
            const inputValue = input.value.trim();
            if (inputValue && addButton) {
                // Фільтруємо опції, виключаючи повідомлення про відсутність варіантів
                const realOptions = Array.from(options).filter(opt => opt.dataset.value);
                const isValidChoice = realOptions.length > 0 && realOptions.some(opt => {
                    return opt.dataset.value && opt.dataset.value.toLowerCase() === inputValue.toLowerCase();
                });
                if (!isValidChoice || realOptions.length === 0) {
                    addButton.classList.remove('hidden');
                }
            }
        });
        
        // При втраті фокусу, якщо значення вибрано зі списку, повертаємо readonly
        input.addEventListener('blur', () => {
            const inputValue = input.value.trim();
            // Фільтруємо опції, виключаючи повідомлення про відсутність варіантів
            const realOptions = Array.from(options).filter(opt => opt.dataset.value);
            const isValidChoice = realOptions.some(opt => opt.dataset.value === inputValue);
            if (isValidChoice) {
                input.setAttribute('readonly', 'readonly');
                if (addButton) {
                    addButton.classList.add('hidden');
                }
            }
        });
        
        // Вибір опції
        options.forEach(option => {
            option.addEventListener('click', () => {
                const selectedValue = option.dataset.value;
                input.value = selectedValue;
                input.setAttribute('readonly', 'readonly');
                dropdown.classList.add('hidden');
                addButton.classList.add('hidden');
                const productId = currentProductId || getProductIdFromUrl();
                if (productId) {
                    saveCharacteristicValueFromInput(productId, charId, selectedValue);
                }
            });
        });
        
        // Обробник для кнопки "Додати" - додає новий варіант до характеристики
        addButton.addEventListener('click', async () => {
            const newValue = input.value.trim();
            if (!newValue) {
                showToast('❌ Введіть значення', 'error');
                return;
            }
            
            try {
                // Отримуємо поточну характеристику
                const char = characteristicsData.find(c => c.id === charId);
                if (!char) {
                    throw new Error('Характеристику не знайдено');
                }
                
                // Додаємо новий варіант до списку choices
                const updatedChoices = [...(char.choices || []), newValue];
                
                // Оновлюємо характеристику на сервері
                const response = await fetch(`/characteristics/${charId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: char.name,
                        type: char.type,
                        priority: char.priority,
                        unit: char.unit,
                        group_id: char.group_id,
                        category_path: char.category_path || [],
                        photo_url: char.photo_url,
                        choices: updatedChoices
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Помилка оновлення характеристики');
                }
                
                // Зберігаємо значення для товару (якщо є productId)
                const productId = currentProductId || getProductIdFromUrl();
                if (productId) {
                    await saveCharacteristicValueFromInput(productId, charId, newValue);
                }
                
                // Перезавантажуємо характеристики
                await loadCharacteristics();
                
                if (productId) {
                    showToast('✅ Варіант додано та значення збережено', 'success');
                } else {
                    showToast('✅ Варіант додано', 'success');
                }
            } catch (error) {
                console.error('Помилка додавання варіанту:', error);
                showToast(`❌ Помилка: ${error.message}`, 'error');
            }
        });
        
        // Закриття при кліку поза елементом
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        
        // Обробник для кнопки "Додати" - додає новий варіант до характеристики
        addButton.addEventListener('click', async () => {
            const newValue = input.value.trim();
            if (!newValue) {
                showToast('❌ Введіть значення', 'error');
                return;
            }
            
            try {
                // Отримуємо поточну характеристику
                const char = characteristicsData.find(c => c.id === charId);
                if (!char) {
                    throw new Error('Характеристику не знайдено');
                }
                
                // Додаємо новий варіант до списку choices
                const updatedChoices = [...(char.choices || []), newValue];
                
                // Оновлюємо характеристику на сервері
                const response = await fetch(`/characteristics/${charId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: char.name,
                        type: char.type,
                        priority: char.priority,
                        unit: char.unit,
                        group_id: char.group_id,
                        category_path: char.category_path || [],
                        photo_url: char.photo_url,
                        choices: updatedChoices
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Помилка оновлення характеристики');
                }
                
                // Зберігаємо значення для товару (якщо є productId)
                const productId = currentProductId || getProductIdFromUrl();
                if (productId) {
                    await saveCharacteristicValueFromInput(productId, charId, newValue);
                }
                
                // Перезавантажуємо характеристики
                await loadCharacteristics();
                
                if (productId) {
                    showToast('✅ Варіант додано та значення збережено', 'success');
                } else {
                    showToast('✅ Варіант додано', 'success');
                }
            } catch (error) {
                console.error('Помилка додавання варіанту:', error);
                showToast(`❌ Помилка: ${error.message}`, 'error');
            }
        });
    });
    
    // Додаємо обробники подій для ручного введення (якщо немає варіантів)
    container.querySelectorAll('.char-manual-input').forEach(input => {
        input.addEventListener('blur', () => {
            const charId = input.dataset.charId;
            const value = input.value.trim();
            // Отримуємо productId (може бути null, якщо не на сторінці товару)
            const productId = currentProductId || getProductIdFromUrl();
            if (value && productId) {
                saveCharacteristicValueFromInput(productId, charId, value);
            } else if (value && !productId) {
                // Якщо немає productId, показуємо повідомлення
                showToast('⚠️ Відкрийте картку товару для збереження значення', 'info');
            }
        });
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
        });
    });
    
    // Додаємо обробники подій для variation multi-select з тегами
    container.querySelectorAll('.char-variation-select-container').forEach(variationContainer => {
        const charId = variationContainer.dataset.charId;
        const input = variationContainer.querySelector('.char-variation-input');
        const dropdown = variationContainer.querySelector('.char-variation-dropdown');
        const options = variationContainer.querySelectorAll('.char-variation-option');
        const tagsContainer = variationContainer.querySelector('.char-variation-tags');
        
        // Функція для отримання поточних значень
        const getCurrentValues = () => {
            const char = characteristicsData.find(c => c.id === charId);
            const value = char?.value || '';
            return value ? value.split(',').map(v => v.trim()).filter(v => v) : [];
        };
        
        // Функція для оновлення відображення тегів
        const updateTags = (values) => {
            tagsContainer.innerHTML = '';
            values.forEach(selectedValue => {
                const tag = document.createElement('span');
                tag.className = 'char-variation-tag inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm border border-blue-300';
                tag.innerHTML = `
                    <span>${escapeHtml(selectedValue)}</span>
                    <button type="button" class="char-variation-remove text-blue-600 hover:text-blue-800 font-bold" data-value="${escapeHtml(selectedValue)}" title="Видалити">&times;</button>
                `;
                tagsContainer.appendChild(tag);
            });
            
            // Додаємо обробники для кнопок видалення
            tagsContainer.querySelectorAll('.char-variation-remove').forEach(removeBtn => {
                removeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const valueToRemove = removeBtn.dataset.value?.trim();
                    if (!valueToRemove) return;
                    
                    const currentValues = getCurrentValues();
                    // Нормалізуємо значення для порівняння (видаляємо пробіли)
                    const newValues = currentValues.filter(v => v.trim() !== valueToRemove);
                    
                    console.log('Видалення варіанту (updateTags):', {
                        valueToRemove,
                        currentValues,
                        newValues
                    });
                    
                    const productId = currentProductId || getProductIdFromUrl();
                    if (productId) {
                        const valueToSave = newValues.length > 0 ? newValues.join(',') : null;
                        await saveCharacteristicValueFromInput(productId, charId, valueToSave);
                        await loadCharacteristics();
                    } else {
                        showToast('⚠️ Відкрийте картку товару для збереження змін', 'info');
                    }
                });
            });
        };
        
        // Функція для оновлення підсвітки в dropdown
        const updateDropdownHighlight = () => {
            const currentValues = getCurrentValues();
            options.forEach(option => {
                const value = option.dataset.value;
                const isSelected = currentValues.includes(value);
                if (isSelected) {
                    option.classList.add('bg-gray-100', 'text-gray-600');
                    option.classList.remove('hover:bg-blue-50');
                } else {
                    option.classList.remove('bg-gray-100', 'text-gray-600');
                    option.classList.add('hover:bg-blue-50');
                }
            });
        };
        
        // Відкриття/закриття dropdown
        input.addEventListener('focus', () => {
            if (!input.disabled) {
                dropdown.classList.remove('hidden');
                updateDropdownHighlight();
            }
        });
        
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!input.disabled) {
                dropdown.classList.remove('hidden');
                updateDropdownHighlight();
            }
        });
        
        // Закриття dropdown при кліку поза ним
        document.addEventListener('click', (e) => {
            if (!variationContainer.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        
        // Вибір варіанту зі списку
        options.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const selectedValue = option.dataset.value;
                const currentValues = getCurrentValues();
                
                // Якщо варіант вже обраний, не додаємо його знову
                if (currentValues.includes(selectedValue)) {
                    dropdown.classList.add('hidden');
                    return;
                }
                
                // Додаємо новий варіант
                currentValues.push(selectedValue);
                
                const productId = currentProductId || getProductIdFromUrl();
                if (productId) {
                    await saveCharacteristicValueFromInput(productId, charId, currentValues.join(','));
                    await loadCharacteristics();
                }
                
                dropdown.classList.add('hidden');
                input.value = '';
            });
        });
        
        // Фільтрація при введенні тексту
        input.addEventListener('input', (e) => {
            const searchText = e.target.value.toLowerCase().trim();
            options.forEach(option => {
                const optionText = option.textContent.toLowerCase();
                if (optionText.includes(searchText)) {
                    option.style.display = '';
                } else {
                    option.style.display = 'none';
                }
            });
            dropdown.classList.remove('hidden');
            updateDropdownHighlight();
        });
        
        // Додаємо обробники для початкових кнопок видалення (які вже є в HTML)
        tagsContainer.querySelectorAll('.char-variation-remove').forEach(removeBtn => {
            removeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const valueToRemove = removeBtn.dataset.value?.trim();
                if (!valueToRemove) return;
                
                const currentValues = getCurrentValues();
                // Нормалізуємо значення для порівняння (видаляємо пробіли)
                const newValues = currentValues.filter(v => v.trim() !== valueToRemove);
                
                console.log('Видалення варіанту:', {
                    valueToRemove,
                    currentValues,
                    newValues
                });
                
                const productId = currentProductId || getProductIdFromUrl();
                if (productId) {
                    const valueToSave = newValues.length > 0 ? newValues.join(',') : null;
                    await saveCharacteristicValueFromInput(productId, charId, valueToSave);
                    await loadCharacteristics();
                } else {
                    showToast('⚠️ Відкрийте картку товару для збереження змін', 'info');
                }
            });
        });
    });
    
    // Додаємо обробники подій для кнопок редагування значень
    container.querySelectorAll('.edit-char-value-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const charId = btn.dataset.charId;
            const charName = btn.dataset.charName;
            const charType = btn.dataset.charType;
            const charValue = btn.dataset.charValue;
            const charPhoto = btn.dataset.charPhoto;
            editCharacteristicValue(charId, charName, charType, charValue, charPhoto);
        });
    });
    
    // Додаємо обробники подій для полів типу number
    container.querySelectorAll('.char-number-input').forEach(input => {
        // Зберігаємо значення при втраті фокусу або натисканні Enter
        const handleSave = async () => {
            const charId = input.dataset.charId;
            const value = input.value.trim();
            const productId = currentProductId || getProductIdFromUrl();
            
            if (productId) {
                // Якщо поле порожнє, зберігаємо null
                const valueToSave = value === '' ? null : value;
                await saveCharacteristicValueFromInput(productId, charId, valueToSave);
            }
        };
        
        input.addEventListener('blur', handleSave);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur(); // Викликає blur, який збереже значення
            }
        });
    });
    
    // Додаємо обробники подій для полів типу text
    container.querySelectorAll('.char-text-input').forEach(input => {
        // Зберігаємо значення при втраті фокусу або натисканні Enter
        const handleSave = async () => {
            const charId = input.dataset.charId;
            const value = input.value.trim();
            const productId = currentProductId || getProductIdFromUrl();
            
            if (productId) {
                // Якщо поле порожнє, зберігаємо null
                const valueToSave = value === '' ? null : value;
                await saveCharacteristicValueFromInput(productId, charId, valueToSave);
            }
        };
        
        input.addEventListener('blur', handleSave);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur(); // Викликає blur, який збереже значення
            }
        });
    });
}

// Функція для фільтрації опцій у dropdown
function filterDropdownOptions(input, options) {
    const searchText = input.value.toLowerCase();
    // Якщо опцій немає, нічого не робимо
    if (options.length === 0) {
        return;
    }
    options.forEach(option => {
        const optionText = option.textContent.toLowerCase();
        // Перевіряємо, чи це не повідомлення про відсутність варіантів
        if (option.classList.contains('text-gray-500') || option.classList.contains('italic')) {
            // Показуємо повідомлення, якщо поле порожнє або містить текст
            option.style.display = searchText ? 'none' : '';
        } else if (optionText.includes(searchText)) {
            option.style.display = '';
        } else {
            option.style.display = 'none';
        }
    });
}

// Відображення всіх груп характеристик
async function displayAllGroups() {
    const container = document.getElementById('groupsContent');
    if (!container) {
        console.warn('Елемент groupsContent не знайдено');
        return;
    }
    
    try {
        console.log('Завантаження груп характеристик...');
        const response = await fetch('/characteristics/groups');
        console.log('Відповідь отримано:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Помилка відповіді:', errorText);
            throw new Error(`Помилка завантаження груп: ${response.status} - ${errorText.substring(0, 100)}`);
        }
        
        // Перевіряємо, чи відповідь є JSON
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Очікувався JSON, отримано:', contentType);
            console.error('Текст відповіді:', text.substring(0, 500));
            throw new Error('Сервер повернув не JSON відповідь. Можливо, помилка на сервері.');
        }
        
        const data = await response.json();
        console.log('Дані груп отримано:', data);
        const allGroups = data.groups || [];
        
        if (allGroups.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">Групи характеристик відсутні. Додайте групи.</div>';
            return;
        }
        
        // Сортуємо групи за пріоритетом або назвою
        const sortedGroups = [...allGroups].sort((a, b) => {
            const priorityA = a.priority || 999;
            const priorityB = b.priority || 999;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return (a.name || '').localeCompare(b.name || '');
        });
        
        let html = '<div class="space-y-4">';
        sortedGroups.forEach(group => {
            const categoryPaths = group.category_path || [];
            const categoryDisplay = categoryPaths.length > 0 
                ? categoryPaths.map(path => {
                    const parts = path.split(':');
                    return parts.length > 1 ? parts[1] : path;
                }).join(', ')
                : 'Всі категорії';
            
            html += `
                <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <h4 class="text-lg font-semibold text-[#1f2937] mb-2">${escapeHtml(group.name)}</h4>
                            ${group.description ? `<p class="text-sm text-gray-600 mb-2">${escapeHtml(group.description)}</p>` : ''}
                            <div class="text-xs text-gray-500">
                                <span class="font-medium">Категорії:</span> ${escapeHtml(categoryDisplay)}
                            </div>
                        </div>
                        <div class="flex gap-2 ml-4">
                            <button onclick="window.openEditGroupModal('${group.id}')" 
                                    class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition">
                                Редагувати
                            </button>
                            <button onclick="window.deleteGroup('${group.id}')" type="button" 
                                    class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition">
                                Видалити
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Помилка завантаження груп:', error);
        container.innerHTML = `<div class="text-center text-red-500 py-8">Помилка: ${error.message}</div>`;
    }
}

// Відображення всіх характеристик (без прив'язки до товару)
async function displayAllCharacteristics() {
    const container = document.getElementById('characteristicsContent');
    if (!container) {
        console.warn('Елемент characteristicsContent не знайдено');
        return;
    }
    
    try {
        console.log('Завантаження характеристик...');
        const response = await fetch('/characteristics');
        console.log('Відповідь отримано:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Помилка відповіді:', errorText);
            throw new Error(`Помилка завантаження характеристик: ${response.status} - ${errorText.substring(0, 100)}`);
        }
        
        // Перевіряємо, чи відповідь є JSON
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Очікувався JSON, отримано:', contentType);
            console.error('Текст відповіді:', text.substring(0, 500));
            throw new Error('Сервер повернув не JSON відповідь. Можливо, помилка на сервері.');
        }
        
        const data = await response.json();
        console.log('Дані отримано:', data);
        let allCharacteristics = data.characteristics || [];
        
        // Фільтрація
        const searchText = document.getElementById('characteristicsSearch')?.value.toLowerCase() || '';
        const categoryFilter = document.getElementById('characteristicsCategoryFilter')?.value || '';
        
        if (searchText) {
            allCharacteristics = allCharacteristics.filter(char => char.name.toLowerCase().includes(searchText));
        }
        if (categoryFilter) {
            allCharacteristics = allCharacteristics.filter(char => {
                const charCategories = char.category_path || [];
                return charCategories.includes(categoryFilter);
            });
        }
        
        if (allCharacteristics.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">Характеристики відсутні. Додайте характеристики.</div>';
            return;
        }
        
        // Групуємо та відображаємо всі характеристики
        const grouped = {};
        allCharacteristics.forEach(char => {
            const groupId = char.group_id || 'no-group';
            if (!grouped[groupId]) {
                const group = groupsData.find(g => g.id === groupId);
                grouped[groupId] = {
                    group: group || null,
                    characteristics: []
                };
            }
            grouped[groupId].characteristics.push(char);
        });
        
        // Сортування груп
        const sortedGroups = Object.keys(grouped).sort((a, b) => {
            const groupA = grouped[a].group;
            const groupB = grouped[b].group;
            if (!groupA && !groupB) return 0;
            if (!groupA) return 1;
            if (!groupB) return -1;
            return (groupA.name || '').localeCompare(groupB.name || '');
        });
        
        // Сортування характеристик за пріоритетом
        sortedGroups.forEach(groupId => {
            grouped[groupId].characteristics.sort((a, b) => {
                const priorityA = a.priority || 2;
                const priorityB = b.priority || 2;
                if (priorityA !== priorityB) return priorityA - priorityB;
                return (a.name || '').localeCompare(b.name || '');
            });
        });
        
        let html = '';
        sortedGroups.forEach(groupId => {
            const groupData = grouped[groupId];
            const group = groupData.group;
            
            if (group) {
                html += `<div class="mb-6 border border-gray-200 rounded-lg p-4">`;
                html += `<h4 class="text-lg font-semibold text-[#1f2937] mb-3">${escapeHtml(group.name)}</h4>`;
                if (group.description) {
                    html += `<p class="text-sm text-gray-600 mb-3">${escapeHtml(group.description)}</p>`;
                }
            } else {
                html += `<div class="mb-6">`;
            }
            
            html += `<div class="space-y-3">`;
            groupData.characteristics.forEach(char => {
                html += `<div class="flex items-start justify-between p-3 bg-gray-50 rounded-lg">`;
                html += `<div class="flex-1">`;
                html += `<div class="flex items-center gap-2 mb-1">`;
                html += `<span class="font-medium text-gray-800">${escapeHtml(char.name)}</span>`;
                if (char.unit) {
                    html += `<span class="text-sm text-gray-500">(${escapeHtml(char.unit)})</span>`;
                }
                html += `</div>`;
                html += `<span class="text-sm text-gray-500">Тип: ${escapeHtml(char.type)} | Пріоритет: ${char.priority || 2}</span>`;
                html += `</div>`;
                html += `<div class="flex gap-2 ml-4">`;
                html += `<button onclick="window.openEditCharacteristicModal('${char.id}')" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition">Редагувати</button>`;
                html += `<button onclick="window.deleteCharacteristic('${char.id}')" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition">Видалити</button>`;
                html += `</div>`;
                html += `</div>`;
            });
            html += `</div>`;
            html += `</div>`;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Помилка завантаження всіх характеристик:', error);
        console.error('Stack trace:', error.stack);
        container.innerHTML = `<div class="text-center text-red-500 py-8">Помилка: ${escapeHtml(error.message)}</div>`;
    }
}

// Відкриття модального вікна для додавання групи
function openAddGroupModal() {
    document.getElementById('groupModalTitle').textContent = 'Додати групу характеристик';
    document.getElementById('groupForm').reset();
    document.getElementById('groupModalId').value = '';
    document.getElementById('groupPriority').value = '2'; // Встановлюємо значення за замовчуванням
    document.getElementById('groupCategoryPath').value = '';
    document.getElementById('groupCategoryPaths').value = '';
    selectedCategories = [];
    document.getElementById('groupModal').classList.remove('hidden');
}

// Видалення групи характеристик
async function deleteGroup(groupId) {
    if (!confirm('Ви впевнені, що хочете видалити цю групу? Характеристики з цієї групи отримають категорії групи.')) {
        return;
    }
    
    try {
        const response = await fetch(`/characteristics/groups/${groupId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Помилка видалення групи: ${errorText.substring(0, 100)}`);
        }
        
        await loadGroups();
        if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
            await displayAllCharacteristics();
            await displayAllGroups();
        } else {
            await loadCharacteristics();
        }
        showToast('✅ Групу успішно видалено', 'success');
    } catch (error) {
        showToast(`❌ Помилка: ${error.message}`, 'error');
    }
}

// Експортуємо deleteGroup одразу після визначення
window.deleteGroup = deleteGroup;

// Видалення характеристики
async function deleteCharacteristic(charId) {
    if (!confirm('Ви впевнені, що хочете видалити цю характеристику?')) {
        return;
    }
    
    try {
        const response = await fetch(`/characteristics/${charId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Помилка видалення характеристики: ${errorText.substring(0, 100)}`);
        }
        
        if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
            await displayAllCharacteristics();
            await displayAllGroups();
        } else {
            await loadCharacteristics();
        }
        showToast('✅ Характеристику успішно видалено', 'success');
    } catch (error) {
        showToast(`❌ Помилка: ${error.message}`, 'error');
    }
}

// Експортуємо deleteCharacteristic одразу після визначення
window.deleteCharacteristic = deleteCharacteristic;

// Відкриття модального вікна для редагування характеристики
function openEditCharacteristicModal(charId) {
    const char = characteristicsData.find(c => c.id === charId) || 
                 (window.allCharacteristicsData && window.allCharacteristicsData.find(c => c.id === charId));
    if (!char) {
        // Завантажуємо з сервера
        fetch(`/characteristics`)
            .then(r => r.json())
            .then(data => {
                const char = data.characteristics.find(c => c.id === charId);
                if (char) {
                    fillCharacteristicForm(char);
                } else {
                    showToast('❌ Характеристику не знайдено', 'error');
                }
            })
            .catch(e => showToast(`❌ Помилка завантаження: ${e.message}`, 'error'));
        return;
    }
    fillCharacteristicForm(char);
}

function fillCharacteristicForm(char) {
    document.getElementById('characteristicModalTitle').textContent = 'Редагувати характеристику';
    document.getElementById('characteristicModalId').value = char.id;
    document.getElementById('characteristicName').value = char.name;
    document.getElementById('characteristicType').value = char.type;
    document.getElementById('characteristicPriority').value = char.priority || 2;
    document.getElementById('characteristicUnit').value = char.unit || '';
    document.getElementById('characteristicGroupId').value = char.group_id || '';
    // Поле фото видалено з інтерфейсу
    characteristicChoicesList = char.choices || [];
    updateCharacteristicChoicesList();
    
    // Показуємо поле одиниці виміру для числових
    const unitContainer = document.getElementById('characteristicUnitContainer');
    const choicesContainer = document.getElementById('characteristicChoicesContainer');
    if (char.type === 'number') {
        unitContainer.style.display = 'block';
    } else {
        unitContainer.style.display = 'none';
    }
    
    // Показуємо поле варіантів для choice, variation та brand
    if (char.type === 'choice' || char.type === 'variation' || char.type === 'brand') {
        choicesContainer.style.display = 'block';
        if (char.type === 'brand') {
            // Для типу "brand" використовуємо brand_choices (масив об'єктів)
            characteristicChoicesList = char.brand_choices || [];
            toggleBrandPhotoInputs(true);
        } else {
            // Для інших типів використовуємо choices (масив рядків)
            characteristicChoicesList = char.choices || [];
            toggleBrandPhotoInputs(false);
        }
        updateCharacteristicChoicesList();
    } else {
        choicesContainer.style.display = 'none';
        toggleBrandPhotoInputs(false);
    }
    
    // Відновлюємо вибрані категорії
    const categoryPaths = char.category_path || [];
    if (Array.isArray(categoryPaths) && categoryPaths.length > 0) {
        selectedCategories = categoryPaths;
        document.getElementById('characteristicCategoryPaths').value = categoryPaths.join('|');
        const displayText = categoryPaths.map(path => {
            const parts = path.split(':');
            return parts.length > 1 ? parts[1] : path;
        }).join(', ');
        document.getElementById('characteristicCategoryPath').value = displayText;
    } else {
        selectedCategories = [];
        document.getElementById('characteristicCategoryPath').value = '';
        document.getElementById('characteristicCategoryPaths').value = '';
    }
    
    document.getElementById('characteristicModal').classList.remove('hidden');
}

// Експортуємо openEditCharacteristicModal одразу після визначення
window.openEditCharacteristicModal = openEditCharacteristicModal;

// Відкриття модального вікна для редагування групи
function openEditGroupModal(groupId) {
    const group = groupsData.find(g => g.id === groupId);
    if (!group) return;
    
    document.getElementById('groupModalTitle').textContent = 'Редагувати групу характеристик';
    document.getElementById('groupModalId').value = group.id;
    document.getElementById('groupName').value = group.name;
    document.getElementById('groupDescription').value = group.description || '';
    document.getElementById('groupPriority').value = group.priority || 2;
    
    // Відновлюємо вибрані категорії
    const categoryPaths = group.category_path || [];
    if (Array.isArray(categoryPaths) && categoryPaths.length > 0) {
        selectedCategories = categoryPaths;
        document.getElementById('groupCategoryPaths').value = categoryPaths.join('|');
        // Форматуємо для відображення (видаляємо competitorId: з початку)
        const displayText = categoryPaths.map(path => {
            const parts = path.split(':');
            return parts.length > 1 ? parts[1] : path;
        }).join(', ');
        document.getElementById('groupCategoryPath').value = displayText;
    } else {
        selectedCategories = [];
        document.getElementById('groupCategoryPath').value = '';
        document.getElementById('groupCategoryPaths').value = '';
    }
    
    document.getElementById('groupModal').classList.remove('hidden');
}

// Експортуємо openEditGroupModal одразу після визначення
window.openEditGroupModal = openEditGroupModal;

// Масив для зберігання варіантів характеристики
let characteristicChoicesList = [];

function updateCharacteristicChoicePhotoPreview() {
    const preview = document.getElementById('characteristicChoicePhotoPreview');
    const photoInput = document.getElementById('characteristicChoicePhotoInput');
    if (!preview) return;

    const value = (photoInput?.value || '').trim();
    if (!value) {
        preview.innerHTML = '<p class="text-xs text-gray-500">Фото не вибране</p>';
        return;
    }

    preview.innerHTML = `
        <div class="flex items-center gap-3">
            <img src="${escapeHtml(value)}" alt="Попередній перегляд" class="w-14 h-14 rounded border border-gray-300 object-cover">
            <div class="text-xs text-gray-700 break-all">${escapeHtml(value)}</div>
        </div>
    `;
}

function setCharacteristicChoicePhotoValue(value) {
    const photoInput = document.getElementById('characteristicChoicePhotoInput');
    if (photoInput) {
        photoInput.value = value || '';
    }
    updateCharacteristicChoicePhotoPreview();
}

function handleCharacteristicPhotoFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
            setCharacteristicChoicePhotoValue(result);
            showToast('✅ Фото успішно завантажено', 'success');
        }
    };
    reader.onerror = () => {
        showToast('❌ Не вдалося прочитати файл', 'error');
    };
    reader.readAsDataURL(file);
}

function promptCharacteristicPhotoUrl() {
    const url = prompt('Введіть URL фото');
    if (!url) return;

    if (!isValidHttpUrl(url)) {
        showToast('❌ Невірний формат URL', 'error');
        return;
    }

    setCharacteristicChoicePhotoValue(url.trim());
    showToast('✅ URL фото збережено', 'success');
}

function clearCharacteristicPhotoSelection() {
    const fileInput = document.getElementById('characteristicChoicePhotoFileInput');
    if (fileInput) {
        fileInput.value = '';
    }
    setCharacteristicChoicePhotoValue('');
}

function toggleBrandPhotoInputs(isVisible) {
    const controls = document.getElementById('characteristicPhotoControls');
    const preview = document.getElementById('characteristicChoicePhotoPreview');
    const fileInput = document.getElementById('characteristicChoicePhotoFileInput');

    if (isVisible) {
        controls?.classList.remove('hidden');
        preview?.classList.remove('hidden');
        updateCharacteristicChoicePhotoPreview();
    } else {
        controls?.classList.add('hidden');
        preview?.classList.add('hidden');
        if (fileInput) fileInput.value = '';
        setCharacteristicChoicePhotoValue('');
    }
}

function isValidHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// Додавання варіанту до списку
function addCharacteristicChoice() {
    const input = document.getElementById('characteristicChoiceInput');
    const photoInput = document.getElementById('characteristicChoicePhotoInput');
    const typeSelect = document.getElementById('characteristicType');
    const type = typeSelect ? typeSelect.value : '';
    const choice = input.value.trim();
    
    if (!choice) {
        showToast('❌ Введіть варіант', 'error');
        return;
    }
    
    // Для типу "brand" перевіряємо, чи не додано вже варіант з такою назвою
    if (type === 'brand') {
        const photoUrl = photoInput ? photoInput.value.trim() : '';
        const exists = characteristicChoicesList.some(c =>
            (typeof c === 'string' ? c === choice : c.name === choice)
        );
        if (exists) {
            showToast('❌ Цей варіант вже додано', 'error');
            return;
        }
        characteristicChoicesList.push({ name: choice, photo_url: photoUrl || null });
        input.value = '';
        setCharacteristicChoicePhotoValue('');
        const fileInput = document.getElementById('characteristicChoicePhotoFileInput');
        if (fileInput) fileInput.value = '';
    } else {
        // Для інших типів (choice, variation) - просто рядки
        if (characteristicChoicesList.includes(choice)) {
            showToast('❌ Цей варіант вже додано', 'error');
            return;
        }
        characteristicChoicesList.push(choice);
        input.value = '';
    }
    
    updateCharacteristicChoicesList();
}

// Видалення варіанту зі списку
async function removeCharacteristicChoice(choiceOrIndex, type) {
    console.log('=== removeCharacteristicChoice ВИКЛИКАНО ===', choiceOrIndex, type);
    
    // Отримуємо ID характеристики з модального вікна
    const charId = document.getElementById('characteristicModalId')?.value;
    const typeSelect = document.getElementById('characteristicType');
    const currentType = type || (typeSelect ? typeSelect.value : '');
    
    let deletedChoice = null;
    
    // Видаляємо варіант зі списку
    if (type === 'brand' && typeof choiceOrIndex === 'number') {
        // Для типу "brand" - видаляємо за індексом
        deletedChoice = characteristicChoicesList[choiceOrIndex];
        characteristicChoicesList.splice(choiceOrIndex, 1);
    } else {
        // Для інших типів - видаляємо за значенням
        deletedChoice = choiceOrIndex;
        characteristicChoicesList = characteristicChoicesList.filter(c => {
            if (typeof c === 'string') {
                return c !== choiceOrIndex;
            } else {
                return c.name !== choiceOrIndex;
            }
        });
    }
    
    updateCharacteristicChoicesList();
    
    // Якщо є ID характеристики (редагування існуючої), оновлюємо характеристику на сервері одразу
    if (charId) {
        try {
            // Спочатку очищаємо значення в картці товару, якщо воно відповідає видаленому варіанту
            const productId = currentProductId || getProductIdFromUrl();
            if (productId) {
                console.log('Очищаємо значення для товару:', productId, 'характеристики:', charId, 'варіанту:', choice);
                await clearCharacteristicValueIfMatches(productId, charId, choice);
            }
            
            // Отримуємо поточну характеристику з сервера
            const response = await fetch(`/characteristics`);
            if (response.ok) {
                const data = await response.json();
                const char = data.characteristics.find(c => c.id === charId);
                
                if (char) {
                    // Оновлюємо характеристику на сервері з новим списком варіантів
                    const updatedChoices = characteristicChoicesList;
                    console.log('Оновлюємо характеристику на сервері з варіантами:', updatedChoices);
                    
                    // Якщо після видалення залишилося 0 варіантів, перевіряємо чи значення відповідає видаленому варіанту
                    if (updatedChoices.length === 0 && productId) {
                        console.log('Після видалення залишилося 0 варіантів, перевіряємо значення...');
                        // Додаткова перевірка: якщо значення відповідає видаленому варіанту, очищаємо його
                        await clearCharacteristicValueIfMatches(productId, charId, choice);
                    }
                    
                    const updateResponse = await fetch(`/characteristics/${charId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: char.name,
                            type: char.type,
                            priority: char.priority,
                            unit: char.unit,
                            group_id: char.group_id,
                            category_path: char.category_path || [],
                            photo_url: char.photo_url,
                            choices: updatedChoices
                        })
                    });
                    
                    if (updateResponse.ok) {
                        console.log('Характеристику успішно оновлено на сервері');
                        // Після оновлення характеристику на сервері, перезавантажуємо характеристики в картці товару
                        if (productId) {
                            // Перезавантажуємо характеристики, щоб оновити список варіантів
                            await loadCharacteristics();
                        }
                    } else {
                        console.error('Помилка оновлення характеристики на сервері:', updateResponse.status);
                    }
                }
            }
        } catch (error) {
            console.error('Помилка оновлення характеристики на сервері:', error);
        }
    }
}

// Допоміжна функція для очищення значення характеристики, якщо воно відповідає видаленому варіанту
async function clearCharacteristicValueIfMatches(productId, charId, deletedChoice) {
    console.log('=== clearCharacteristicValueIfMatches ВИКЛИКАНО ===', { productId, charId, deletedChoice });
    
    try {
        // Отримуємо поточне значення характеристики для товару
        const response = await fetch(`/products/${productId}/characteristics`);
        if (response.ok) {
            const data = await response.json();
            const charValue = data.characteristics?.find(c => c.id === charId);
            
            console.log('Поточна характеристика:', charValue);
            
            if (charValue) {
                const currentValue = charValue.value || '';
                const charType = charValue.type || '';
                
                console.log('Поточне значення:', currentValue, 'Тип:', charType, 'Видалений варіант:', deletedChoice);
                
                // Нормалізуємо значення для порівняння (видаляємо зайві пробіли)
                const normalizedCurrentValue = currentValue.trim();
                const normalizedDeletedChoice = deletedChoice.trim();
                
                // Для variation типу (кілька значень через кому)
                if (charType === 'variation' && normalizedCurrentValue.includes(',')) {
                    let values = normalizedCurrentValue.split(',').map(v => v.trim()).filter(v => v);
                    console.log('Поточні значення (variation):', values);
                    // Видаляємо видалений варіант зі списку
                    const beforeLength = values.length;
                    values = values.filter(v => v !== normalizedDeletedChoice);
                    console.log('Значення після видалення:', values, 'Було видалено:', beforeLength !== values.length);
                    
                    // Зберігаємо оновлені значення
                    if (values.length > 0) {
                        await saveCharacteristicValueFromInput(productId, charId, values.join(','), false);
                        console.log('Оновлено значення variation:', values.join(','));
                    } else {
                        await saveCharacteristicValueFromInput(productId, charId, null, false);
                        console.log('Очищено значення variation (список порожній)');
                    }
                } 
                // Для choice типу або manual input (одне значення)
                // Перевіряємо точне співпадіння після нормалізації
                else {
                    // Точне співпадіння після нормалізації (видалення пробілів)
                    const isExactMatch = normalizedCurrentValue === normalizedDeletedChoice;
                    
                    // Також перевіряємо співпадіння без урахування регістру (на випадок відмінностей)
                    const isCaseInsensitiveMatch = normalizedCurrentValue.toLowerCase() === normalizedDeletedChoice.toLowerCase();
                    
                    console.log('Перевірка співпадіння для choice типу:', {
                        currentValue: normalizedCurrentValue,
                        deletedChoice: normalizedDeletedChoice,
                        isExactMatch,
                        isCaseInsensitiveMatch,
                        currentValueLength: normalizedCurrentValue.length,
                        deletedChoiceLength: normalizedDeletedChoice.length
                    });
                    
                    // Якщо значення точно співпадає (з урахуванням або без урахування регістру), очищаємо
                    if (isExactMatch || isCaseInsensitiveMatch) {
                        console.log('Значення співпадає, очищаємо...');
                        // Очищаємо значення
                        await saveCharacteristicValueFromInput(productId, charId, null, false);
                        console.log('Значення успішно очищено');
                    } else {
                        console.log('Значення не співпадає:', {
                            current: `"${normalizedCurrentValue}"`,
                            deleted: `"${normalizedDeletedChoice}"`,
                            currentLength: normalizedCurrentValue.length,
                            deletedLength: normalizedDeletedChoice.length
                        });
                    }
                }
            } else {
                console.log('Характеристику не знайдено для товару');
            }
        } else {
            console.error('Помилка отримання характеристик товару:', response.status);
        }
    } catch (error) {
        console.error('Помилка очищення значення характеристики:', error);
    }
}

// Експортуємо removeCharacteristicChoice глобально для використання в onclick
window.removeCharacteristicChoice = removeCharacteristicChoice;

// Оновлення відображення списку варіантів
function updateCharacteristicChoicesList() {
    const container = document.getElementById('characteristicChoicesList');
    if (!container) return;
    
    const typeSelect = document.getElementById('characteristicType');
    const type = typeSelect ? typeSelect.value : '';
    
    if (characteristicChoicesList.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">Список варіантів порожній</p>';
        return;
    }
    
    let html = '<div class="space-y-2">';
    characteristicChoicesList.forEach((choice, index) => {
        if (type === 'brand' && typeof choice === 'object') {
            // Для типу "brand" - об'єкт {name, photo_url}
            const choiceName = choice.name || '';
            const photoUrl = choice.photo_url || '';
            html += `<div class="flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-lg">`;
            html += `<div class="flex items-center gap-3 flex-1">`;
            if (photoUrl) {
                html += `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(choiceName)}" class="w-8 h-8 rounded border border-gray-300 object-cover">`;
            }
            html += `<span class="text-gray-800">${escapeHtml(choiceName)}</span>`;
            html += `</div>`;
            html += `<button type="button" onclick="removeCharacteristicChoice(${index}, 'brand')" class="text-red-600 hover:text-red-700 font-medium">×</button>`;
            html += `</div>`;
        } else {
            // Для інших типів - просто рядок
            const choiceStr = typeof choice === 'string' ? choice : choice.name || '';
            html += `<div class="flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-lg">`;
            html += `<span class="text-gray-800">${escapeHtml(choiceStr)}</span>`;
            html += `<button type="button" onclick="removeCharacteristicChoice('${escapeHtml(choiceStr)}')" class="text-red-600 hover:text-red-700 font-medium">×</button>`;
            html += `</div>`;
        }
    });
    html += '</div>';
    container.innerHTML = html;
}

// Відкриття модального вікна для додавання характеристики
function openAddCharacteristicModal() {
    document.getElementById('characteristicModalTitle').textContent = 'Додати характеристику';
    document.getElementById('characteristicForm').reset();
    document.getElementById('characteristicModalId').value = '';
    document.getElementById('characteristicUnitContainer').style.display = 'none';
    document.getElementById('characteristicChoicesContainer').style.display = 'none';
    toggleBrandPhotoInputs(false);
    characteristicChoicesList = [];
    updateCharacteristicChoicesList();
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
    const priority = parseInt(document.getElementById('groupPriority').value) || 2;
    const categoryPathsInput = document.getElementById('groupCategoryPaths')?.value || '';
    const categoryPath = categoryPathsInput ? categoryPathsInput.split('|').filter(s => s) : [];
    
    try {
        const url = groupId ? `/characteristics/groups/${groupId}` : '/characteristics/groups';
        const method = groupId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, priority, category_path: categoryPath })
        });
        
        if (!response.ok) throw new Error('Помилка збереження групи');
        
        await loadGroups();
        if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
            await displayAllCharacteristics();
            await displayAllGroups();
        } else {
            await loadCharacteristics();
        }
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
    const priority = parseInt(document.getElementById('characteristicPriority').value) || 2;
    const unit = document.getElementById('characteristicUnit').value || null;
    const groupId = document.getElementById('characteristicGroupId').value || null;
    const categoryPathsInput = document.getElementById('characteristicCategoryPaths')?.value || '';
    const categoryPath = categoryPathsInput ? categoryPathsInput.split('|').filter(s => s) : [];
    // Поле фото видалено з інтерфейсу, встановлюємо null
    const photoUrl = null;
    
    // Для типу "brand" використовуємо brand_choices (масив об'єктів), для інших - choices (масив рядків)
    let choices = [];
    let brand_choices = [];
    if (type === 'brand') {
        brand_choices = characteristicChoicesList || [];
    } else {
        choices = characteristicChoicesList || [];
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
        
        if (!response.ok) {
            let errorText = '';
            try {
                errorText = await response.text();
            } catch (e) {
                errorText = `HTTP ${response.status}`;
            }
            throw new Error(`Помилка збереження характеристики: ${errorText.substring(0, 100)}`);
        }
        
        if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
            await displayAllCharacteristics();
            await displayAllGroups();
            await updateCategoryFilter();
        } else {
            await loadCharacteristics();
            await updateCategoryFilter();
        }
        closeCharacteristicModal();
        showToast('✅ Характеристику успішно збережено', 'success');
    } catch (error) {
        showToast(`❌ Помилка: ${error.message}`, 'error');
    }
}

// Збереження значення характеристики з input (для вибору варіантів)
async function saveCharacteristicValueFromInput(productId, charId, value, showNotification = true) {
    try {
        const response = await fetch(`/products/${productId}/characteristics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                characteristic_id: charId,
                value: value || null,
                photo_url: null
            })
        });
        
        if (!response.ok) {
            throw new Error('Помилка збереження значення');
        }
        
        await loadCharacteristics();
        if (showNotification) {
            showToast('✅ Значення збережено', 'success');
        }
    } catch (error) {
        if (showNotification) {
            showToast(`❌ Помилка: ${error.message}`, 'error');
        }
    }
}

// Збереження значення характеристики
async function saveCharacteristicValue(e) {
    e.preventDefault();
    const productId = currentProductId || getProductIdFromUrl();
    if (!productId) {
        showToast('❌ Помилка: ID товару не знайдено', 'error');
        return;
    }
    
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

// Екранування HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Змінні для вибору категорій
let selectedCategories = [];
let allCompetitorsData = [];

// Відкриття модального вікна вибору категорій
async function openCategorySelectionModal() {
    const modal = document.getElementById('categorySelectionModal');
    if (!modal) {
        console.error('Модальне вікно categorySelectionModal не знайдено');
        return;
    }
    
    // Завантажуємо конкурентів
    await loadCompetitorsForSelection();
    
    // Відновлюємо вибрані категорії з прихованого поля
    const savedPaths = document.getElementById('groupCategoryPaths')?.value || '';
    if (savedPaths) {
        selectedCategories = savedPaths.split('|').filter(p => p);
    } else {
        selectedCategories = [];
    }
    
    modal.classList.remove('hidden');
}

// Закриття модального вікна вибору категорій
function closeCategorySelectionModal() {
    document.getElementById('categorySelectionModal')?.classList.add('hidden');
}

// Завантаження конкурентів для вибору категорій
async function loadCompetitorsForSelection() {
    try {
        const response = await fetch('/competitors/list');
        if (!response.ok) throw new Error('Помилка завантаження конкурентів');
        
        const data = await response.json();
        allCompetitorsData = data.competitors || [];
        
        displayCompetitorsForSelection();
    } catch (error) {
        console.error('Помилка завантаження конкурентів:', error);
        document.getElementById('competitorsList').innerHTML = 
            `<div class="text-center text-red-500 py-4">Помилка завантаження конкурентів: ${error.message}</div>`;
    }
}

// Відображення списку конкурентів
function displayCompetitorsForSelection() {
    const container = document.getElementById('competitorsList');
    if (!container) return;
    
    if (allCompetitorsData.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-4">Конкуренти відсутні</div>';
        return;
    }
    
    let html = '';
    allCompetitorsData.forEach(competitor => {
        html += `
            <div class="border border-gray-200 rounded-lg p-4 mb-2">
                <div class="flex items-center justify-between mb-2">
                    <button type="button" 
                            onclick="window.toggleCompetitorCategories('${competitor.id}'); return false;" 
                            class="flex-1 flex items-center justify-between text-left font-medium text-gray-800 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                        <span>${escapeHtml(competitor.name)}</span>
                        <span id="competitor-icon-${competitor.id}" class="transform transition ml-2">▶</span>
                    </button>
                    <button type="button" 
                            onclick="window.selectAllCompetitorCategories('${competitor.id}'); return false;" 
                            class="ml-2 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition cursor-pointer">
                        Обрати всі
                    </button>
                </div>
                <div id="competitor-categories-${competitor.id}" class="hidden mt-2 ml-4">
                    <div class="text-gray-500 text-sm py-2">Завантаження категорій...</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Глобальні функції для onclick обробників
window.toggleCompetitorCategories = async function(competitorId) {
    const categoriesContainer = document.getElementById(`competitor-categories-${competitorId}`);
    const icon = document.getElementById(`competitor-icon-${competitorId}`);
    
    if (!categoriesContainer || !icon) {
        console.error('Елементи не знайдено для конкурента:', competitorId);
        return;
    }
    
    if (categoriesContainer.classList.contains('hidden')) {
        // Розгортаємо
        categoriesContainer.classList.remove('hidden');
        icon.textContent = '▼';
        
        // Завантажуємо категорії, якщо ще не завантажені
        if (categoriesContainer.innerHTML.includes('Завантаження')) {
            await loadCompetitorCategories(competitorId, categoriesContainer);
        }
    } else {
        // Згортаємо
        categoriesContainer.classList.add('hidden');
        icon.textContent = '▶';
    }
};

window.toggleCategoryTree = function(categoryId) {
    const childrenContainer = document.getElementById(`category-children-${categoryId}`);
    const icon = document.getElementById(`category-icon-${categoryId}`);
    
    if (!childrenContainer || !icon) return;
    
    if (childrenContainer.classList.contains('hidden')) {
        childrenContainer.classList.remove('hidden');
        icon.textContent = '▼';
    } else {
        childrenContainer.classList.add('hidden');
        icon.textContent = '▶';
    }
};

window.toggleCategorySelection = function(categoryPath, isChecked) {
    if (isChecked) {
        if (!selectedCategories.includes(categoryPath)) {
            selectedCategories.push(categoryPath);
        }
    } else {
        selectedCategories = selectedCategories.filter(p => p !== categoryPath);
    }
};

// Обрати всі категорії конкурента
window.selectAllCompetitorCategories = async function(competitorId) {
    try {
        const response = await fetch(`/competitors/${competitorId}`);
        if (!response.ok) throw new Error('Помилка завантаження категорій');
        
        const competitor = await response.json();
        const categories = competitor.categories || [];
        
        // Збираємо всі шляхи категорій рекурсивно
        const allPaths = [];
        function collectPaths(cats, parentPath = []) {
            cats.forEach(category => {
                const currentPath = [...parentPath, category.name];
                const fullPath = `${competitorId}:${currentPath.join(' > ')}`;
                allPaths.push(fullPath);
                
                if (category.children && category.children.length > 0) {
                    collectPaths(category.children, currentPath);
                }
            });
        }
        
        collectPaths(categories);
        
        // Додаємо всі шляхи до вибраних (якщо їх ще немає)
        allPaths.forEach(path => {
            if (!selectedCategories.includes(path)) {
                selectedCategories.push(path);
            }
        });
        
        // Оновлюємо галочки в DOM
        allPaths.forEach(path => {
            const checkbox = document.querySelector(`[data-path="${escapeHtml(path)}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        
        showToast(`✅ Обрано ${allPaths.length} категорій`, 'success');
    } catch (error) {
        console.error('Помилка вибору всіх категорій:', error);
        showToast(`❌ Помилка: ${error.message}`, 'error');
    }
};

// Завантаження категорій конкурента
async function loadCompetitorCategories(competitorId, container) {
    try {
        const response = await fetch(`/competitors/${competitorId}`);
        if (!response.ok) throw new Error('Помилка завантаження категорій');
        
        const competitor = await response.json();
        const categories = competitor.categories || [];
        
        container.innerHTML = renderCategoriesTree(categories, competitorId, 0);
    } catch (error) {
        console.error('Помилка завантаження категорій:', error);
        container.innerHTML = `<div class="text-red-500 text-sm">Помилка: ${error.message}</div>`;
    }
}

// Рендеринг дерева категорій з галочками
function renderCategoriesTree(categories, competitorId, level = 0, parentPath = []) {
    if (categories.length === 0) {
        return '<div class="text-gray-500 text-sm py-2">Категорії відсутні</div>';
    }
    
    let html = '<div class="space-y-1">';
    categories.forEach(category => {
        const indent = level * 24;
        const hasChildren = category.children && category.children.length > 0;
        const currentPath = [...parentPath, category.name];
        const categoryPath = `${competitorId}:${currentPath.join(' > ')}`;
        const isChecked = selectedCategories.includes(categoryPath);
        
        html += `
            <div class="flex items-center gap-2 py-1 hover:bg-gray-50 rounded px-2" style="padding-left: ${indent}px;">
                <input type="checkbox" 
                       class="category-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" 
                       data-path="${escapeHtml(categoryPath)}"
                       ${isChecked ? 'checked' : ''}
                       onchange="window.toggleCategorySelection('${escapeHtml(categoryPath)}', this.checked)">
                ${hasChildren ? `
                    <button onclick="window.toggleCategoryTree('${category.id}')" 
                            class="text-gray-500 hover:text-gray-700 focus:outline-none w-4">
                        <span id="category-icon-${category.id}" class="inline-block transform transition">▶</span>
                    </button>
                ` : '<span class="w-4"></span>'}
                <label class="flex-1 cursor-pointer text-sm text-gray-700" 
                       onclick="document.querySelector('[data-path=\\'${escapeHtml(categoryPath)}\\']').click()">
                    ${escapeHtml(category.name)}
                </label>
            </div>
        `;
        
        if (hasChildren) {
            html += `
                <div id="category-children-${category.id}" class="hidden">
                    ${renderCategoriesTree(category.children, competitorId, level + 1, currentPath)}
                </div>
            `;
        }
    });
    html += '</div>';
    
    return html;
}

// Побудова шляху категорії (рекурсивно)
function buildCategoryPath(category, competitorId, path = []) {
    const currentPath = [...path, category.name];
    return `${competitorId}:${currentPath.join(' > ')}`;
}

// Рекурсивна побудова шляху для всіх категорій
function buildCategoryPathsRecursive(categories, competitorId, path = []) {
    let paths = [];
    categories.forEach(category => {
        const currentPath = [...path, category.name];
        const fullPath = `${competitorId}:${currentPath.join(' > ')}`;
        paths.push(fullPath);
        
        if (category.children && category.children.length > 0) {
            paths = paths.concat(buildCategoryPathsRecursive(category.children, competitorId, currentPath));
        }
    });
    return paths;
}

// Розгортання/згортання підкатегорій
function toggleCategoryTree(categoryId) {
    const childrenContainer = document.getElementById(`category-children-${categoryId}`);
    const icon = document.getElementById(`category-icon-${categoryId}`);
    
    if (!childrenContainer || !icon) return;
    
    if (childrenContainer.classList.contains('hidden')) {
        childrenContainer.classList.remove('hidden');
        icon.textContent = '▼';
    } else {
        childrenContainer.classList.add('hidden');
        icon.textContent = '▶';
    }
}

// Перемикання вибору категорії
function toggleCategorySelection(categoryPath, isChecked) {
    if (isChecked) {
        if (!selectedCategories.includes(categoryPath)) {
            selectedCategories.push(categoryPath);
        }
    } else {
        selectedCategories = selectedCategories.filter(p => p !== categoryPath);
    }
}

// Збереження вибраних категорій
function saveSelectedCategories() {
    const categoryPathInput = document.getElementById('groupCategoryPath');
    const categoryPathsInput = document.getElementById('groupCategoryPaths');
    
    if (selectedCategories.length === 0) {
        if (categoryPathInput) categoryPathInput.value = '';
        if (categoryPathsInput) categoryPathsInput.value = '';
    } else {
        // Форматуємо для відображення
        const displayText = selectedCategories.map(path => {
            const parts = path.split(':');
            return parts.length > 1 ? parts[1] : path;
        }).join(', ');
        
        if (categoryPathInput) categoryPathInput.value = displayText;
        if (categoryPathsInput) categoryPathsInput.value = selectedCategories.join('|');
    }
    
    closeCategorySelectionModal();
}

// Ініціалізація обробників подій для характеристик
function initCharacteristicsHandlers() {
    console.log('=== initCharacteristicsHandlers ВИКЛИКАНО ===');
    console.log('window.location.pathname:', window.location.pathname);
    
    // Перевіряємо, чи ми на сторінці характеристик
    const isCharacteristicsPage = window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page';
    console.log('isCharacteristicsPage:', isCharacteristicsPage);
    
    if (isCharacteristicsPage) {
        // На сторінці характеристик - завантажуємо всі характеристики та групи
        // Викликаємо асинхронно
        (async () => {
            try {
                await loadGroups();
                await displayAllCharacteristics();
                await displayAllGroups();
            } catch (error) {
                console.error('Помилка ініціалізації сторінки характеристик:', error);
            }
        })();
    } else {
        // На інших сторінках (наприклад, сторінка товару)
        // НЕ викликаємо loadCharacteristics тут, бо це зробить displayProduct з product.js
        // Тільки завантажуємо групи для використання в формах
        console.log('initCharacteristicsHandlers: не на сторінці характеристик');
        loadGroups(); // Завантажуємо групи для використання в формах
    }
    
    // Вибір категорій для групи
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'selectCategoriesBtn') {
            e.preventDefault();
            openCategorySelectionModal('group');
        }
        // Вибір категорій для характеристики
        if (e.target && e.target.id === 'selectCharacteristicCategoriesBtn') {
            e.preventDefault();
            openCategorySelectionModal('characteristic');
        }
        if (e.target && e.target.id === 'closeCategorySelectionModal') {
            e.preventDefault();
            closeCategorySelectionModal();
        }
        if (e.target && e.target.id === 'cancelCategorySelection') {
            e.preventDefault();
            closeCategorySelectionModal();
        }
        if (e.target && e.target.id === 'saveSelectedCategories') {
            e.preventDefault();
            saveSelectedCategories();
        }
    });
    
    // Також додаємо обробники напряму (для статичних елементів)
    document.getElementById('selectCategoriesBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openCategorySelectionModal('group');
    });
    document.getElementById('selectCharacteristicCategoriesBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openCategorySelectionModal('characteristic');
    });
    document.getElementById('closeCategorySelectionModal')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeCategorySelectionModal();
    });
    document.getElementById('cancelCategorySelection')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeCategorySelectionModal();
    });
    document.getElementById('saveSelectedCategories')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveSelectedCategories();
    });
    
    // Створення/редагування
    document.getElementById('addGroupBtn')?.addEventListener('click', openAddGroupModal);
    document.getElementById('addCharacteristicBtn')?.addEventListener('click', openAddCharacteristicModal);
    document.getElementById('cancelGroupBtn')?.addEventListener('click', closeGroupModal);
    document.getElementById('cancelCharacteristicBtn')?.addEventListener('click', closeCharacteristicModal);
    document.getElementById('cancelCharacteristicValueBtn')?.addEventListener('click', closeCharacteristicValueModal);
    document.getElementById('groupForm')?.addEventListener('submit', saveGroup);
    document.getElementById('characteristicForm')?.addEventListener('submit', saveCharacteristic);
    document.getElementById('characteristicValueForm')?.addEventListener('submit', saveCharacteristicValue);
    
    // Пошук та фільтри
    document.getElementById('characteristicsSearch')?.addEventListener('input', () => {
        if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
            displayAllCharacteristics();
        } else {
            displayCharacteristics();
        }
    });
    document.getElementById('characteristicsCategoryFilter')?.addEventListener('change', () => {
        if (window.location.pathname === '/characteristics' || window.location.pathname === '/characteristics/page') {
            displayAllCharacteristics();
        } else {
            displayCharacteristics();
        }
    });
    
    // Показ поля одиниці виміру для числових характеристик та варіантів
    document.getElementById('characteristicType')?.addEventListener('change', (e) => {
        const unitContainer = document.getElementById('characteristicUnitContainer');
        const choicesContainer = document.getElementById('characteristicChoicesContainer');
        const type = e.target.value;
        
        if (type === 'number') {
            unitContainer.style.display = 'block';
        } else {
            unitContainer.style.display = 'none';
        }
        
        if (type === 'choice' || type === 'variation' || type === 'brand') {
            choicesContainer.style.display = 'block';
            toggleBrandPhotoInputs(type === 'brand');
        } else {
            choicesContainer.style.display = 'none';
            toggleBrandPhotoInputs(false);
        }
        
        // Очищаємо список варіантів при зміні типу
        characteristicChoicesList = [];
        updateCharacteristicChoicesList();
    });

    document.getElementById('characteristicChoiceUploadBtn')?.addEventListener('click', () => {
        const fileInput = document.getElementById('characteristicChoicePhotoFileInput');
        fileInput?.click();
    });

    document.getElementById('characteristicChoicePhotoFileInput')?.addEventListener('change', handleCharacteristicPhotoFileChange);
    document.getElementById('characteristicChoiceUrlBtn')?.addEventListener('click', promptCharacteristicPhotoUrl);
    document.getElementById('characteristicChoiceClearBtn')?.addEventListener('click', clearCharacteristicPhotoSelection);
    
    // Додавання варіанту характеристики
    document.getElementById('addCharacteristicChoiceBtn')?.addEventListener('click', addCharacteristicChoice);
    
    // Додавання варіанту по Enter
    document.getElementById('characteristicChoiceInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCharacteristicChoice();
        }
    });
    
    // Закриття модальних вікон при кліку поза ними
    document.getElementById('groupModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'groupModal') closeGroupModal();
    });
    document.getElementById('characteristicModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'characteristicModal') closeCharacteristicModal();
    });
    document.getElementById('characteristicValueModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'characteristicValueModal') closeCharacteristicValueModal();
    });
}

// Ініціалізація при завантаженні сторінки
console.log('characteristics.js завантажено, readyState:', document.readyState);
console.log('Перевірка експортованих функцій:');
console.log('  setCurrentProductId:', typeof window.setCurrentProductId);
console.log('  loadCharacteristics:', typeof window.loadCharacteristics);
console.log('  deleteGroup:', typeof window.deleteGroup);
console.log('  deleteCharacteristic:', typeof window.deleteCharacteristic);
console.log('  openEditCharacteristicModal:', typeof window.openEditCharacteristicModal);
console.log('  openEditGroupModal:', typeof window.openEditGroupModal);

if (document.readyState === 'loading') {
    console.log('Додаємо обробник DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded викликано для characteristics.js');
        initCharacteristicsHandlers();
    });
} else {
    console.log('DOM вже завантажено, ініціалізуємо одразу');
    initCharacteristicsHandlers();
}
