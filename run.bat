@echo off
chcp 65001 >nul
echo ========================================
echo   GPT Product Parser - Запуск сервера
echo ========================================
echo.

REM Перевірка наявності Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ПОМИЛКА] Python не знайдено!
    echo Встановіть Python 3.11+ з https://www.python.org/
    pause
    exit /b 1
)

REM Перевірка наявності віртуального середовища (опціонально)
if exist "venv\Scripts\activate.bat" (
    echo [INFO] Активується віртуальне середовище...
    call venv\Scripts\activate.bat
)

REM Перевірка наявності залежностей
echo [INFO] Перевірка залежностей...
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Залежності не встановлені!
    echo Встановлюю залежності...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ПОМИЛКА] Не вдалося встановити залежності!
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Запуск сервера...
echo [INFO] Браузер відкриється автоматично через кілька секунд
echo [INFO] Для зупинки натисніть Ctrl+C
echo.

REM Запуск Python скрипта
python run.py

REM Якщо програма завершилася, пауза перед закриттям
if errorlevel 1 (
    echo.
    echo [ПОМИЛКА] Сервер завершився з помилкою!
    pause
)










