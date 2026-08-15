@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Xolodilnik — Холодильник (Telegram Mini App)
cd /d "%~dp0"

echo.
echo ============================================================
echo    XOLODILNIK — умный холодильник (Telegram Mini App)
echo    Сервер: бот + API + веб-приложение (Windows)
echo ============================================================
echo.

rem ---------- 1. Проверка Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден.
    echo Скачай и установи LTS с https://nodejs.org, затем запусти меня снова.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js: !NODE_VER!

rem ---------- 2. Первый запуск: создаём server\.env ----------
if not exist "server\.env" (
    echo [..] server\.env не найден — создаю из примера.
    copy "server\.env.example" "server\.env" >nul
)

rem ---------- 3. Проверка BOT_TOKEN ----------
set HAS_TOKEN=0
for /f "tokens=2 delims==" %%t in ('findstr /b "BOT_TOKEN=" server\.env') do set BOT_TOKEN=%%t
if not "!BOT_TOKEN!"=="" set HAS_TOKEN=1
if "!HAS_TOKEN!"=="0" (
    echo.
    echo [ДЕЙСТВИЕ] В server\.env не указан BOT_TOKEN.
    echo Создай бота в Telegram: открой @BotFather, команда /newbot,
    echo скопируй токен вида 123456:ABC-DEF... и вставь его ниже:
    echo.
    set /p USER_TOKEN="Токен бота: "
    if not "!USER_TOKEN!"=="" (
        call :setenv BOT_TOKEN !USER_TOKEN!
        echo [OK] BOT_TOKEN сохранён в server\.env
    ) else (
        echo [ПРЕДУПРЕЖДЕНИЕ] Токен не введён — бот запустится без Telegram.
    )
)

rem ---------- 4. Проверка APP_URL ----------
set APP_URL=
for /f "tokens=2 delims==" %%t in ('findstr /b "APP_URL=" server\.env') do set APP_URL=%%t
if "!APP_URL!"=="" (
    echo.
    echo [ДЕЙСТВИЕ] Укажи публичный https-адрес приложения, или нажми Enter чтобы пропустить:
    echo   продакшен : https://твой-домен.ru
    echo   для теста : https://xxxx.ngrok-free.app
    set /p USER_URL="Адрес приложения (APP_URL): "
    if not "!USER_URL!"=="" (
        call :setenv APP_URL !USER_URL!
        echo [OK] APP_URL сохранён в server\.env
    )
)

rem ---------- 5. Установка зависимостей ----------
if not exist "server\node_modules" (
    echo.
    echo [..] Устанавливаю зависимости сервера...
    pushd server
    call npm install --no-audit --no-fund
    popd
)
if not exist "app\node_modules" (
    echo.
    echo [..] Устанавливаю зависимости приложения...
    pushd app
    call npm install --no-audit --no-fund
    popd
)

rem ---------- 6. Сборка фронтенда ----------
echo.
echo [..] Собираю фронтенд (Vite)...
pushd app
call npm run build
popd
if errorlevel 1 (
    echo [ОШИБКА] Не удалось собрать фронтенд. Смотри сообщения выше.
    pause
    exit /b 1
)
echo [OK] Фронтенд собран.

rem ---------- 7. Проверка прокси для Telegram-бота ----------
echo.
echo [..] Проверяю прокси для Telegram-бота (доступ к api.telegram.org)...
node _tools\check_proxy.js
echo.

rem ---------- 8. Запуск ----------
echo.
echo ============================================================
echo    ЗАПУСК СЕРВЕРА + АВТООБНОВЛЕНИЕ С GITHUB
echo    Сервер: порт из server\.env (по умолчанию 3001)
echo    Джоб: проверка GitHub каждые 2 минуты, при изменениях
echo          сам подтянет их, пересоберёт и перезапустит сервер
echo    Остановить: Ctrl+C
echo ============================================================
echo.
node _tools\autoupdate.js
echo.
echo [Сервер остановлен. Чтобы выключить окно, закрой его.]
echo.
pause
exit /b 0

rem ---------- подпрограмма: замена значения в .env ----------
:setenv
findstr /v /b "%1=" server\.env > server\.env.tmp
move /y server\.env.tmp server\.env >nul
echo %1=%2>> server\.env
exit /b 0
