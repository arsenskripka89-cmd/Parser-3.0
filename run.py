"""
Скрипт для запуску GPT Product Parser сервера
Автоматично відкриває браузер після запуску
"""
import uvicorn
import webbrowser
import threading
import time

def open_browser():
    """Відкриває браузер через 2 секунди після запуску сервера"""
    time.sleep(2)  # Чекаємо, поки сервер запуститься
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    # Запускаємо браузер в окремому потоці
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    # Запускаємо сервер
    print(">>> Запуск GPT Product Parser сервера...")
    print(">>> Браузер відкриється автоматично через кілька секунд")
    print(">>> Або відкрийте вручну: http://localhost:8000")
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

