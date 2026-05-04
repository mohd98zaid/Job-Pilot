@echo off
REM Job-Pilot System Launcher
REM Kills any existing processes on the required ports, then starts fresh.
REM Usage: run.bat [start|stop]

SET ACTION=%1
SET BASE_DIR=%~dp0
SET API_SERVER_DIR=%BASE_DIR%artifacts\api-server
SET FRONTEND_DIR=%BASE_DIR%artifacts\jobpilot

if "%ACTION%" == "stop" (
    call :stop_ports
    echo Job-Pilot stopped.
    exit /b
)

call :stop_ports
call :start_system
exit /b

REM ─── Kill anything running on our ports ────────────────────────────────────
:stop_ports
    echo Freeing ports 3005 and 5173...

    for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R ":3005 "') do (
        if not "%%P"=="0" taskkill /PID %%P /T /F >nul 2>&1
    )
    for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R ":5173 "') do (
        if not "%%P"=="0" taskkill /PID %%P /T /F >nul 2>&1
    )

    rem Brief pause for sockets to release
    timeout /t 1 /nobreak >nul
    goto :eof

REM ─── Start both servers ────────────────────────────────────────────────────
:start_system
    echo Starting Job-Pilot...

    start "Job-Pilot API Server"  cmd /k "cd /d %API_SERVER_DIR% && title Job-Pilot API && pnpm run dev"
    start "Job-Pilot Frontend"    cmd /k "cd /d %FRONTEND_DIR%   && title Job-Pilot UI  && pnpm run dev"

    echo.
    echo  Job-Pilot is starting up!
    echo  API Server : http://localhost:3005
    echo  Frontend   : http://localhost:5173
    echo.
    echo  Run "run.bat stop" to shut everything down.
    goto :eof