<#
    Job-Pilot System Controller
    This PowerShell script starts and stops the Job-Pilot system
    Usage: ./run.ps1 [start|stop]
#>

param(
    [string]$action = "start"
)

$baseDir = $PSScriptRoot
$apiServerDir = Join-Path $baseDir "artifacts\\api-server"
$frontendDir = Join-Path $baseDir "artifacts\\jobpilot"
$pidFile = Join-Path $baseDir "jobpilot.pid"

function Start-System {
    Write-Host "Starting Job-Pilot system..." -ForegroundColor Cyan

    # Remove existing PID file if present
    if (Test-Path $pidFile) { Remove-Item $pidFile -Force }

    # Function to start a process
    function Start-ProcessWithLog {
        param(
            [string]$Name,
            [string]$Path,
            [string]$Command
        )

        # Start process in new window
        $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d $Path && title Job-Pilot $Name && $Command" -PassThru -NoNewWindow

        # Return PID
        return $process.Id
    }

    try {
        # Start API server
        $apiPid = Start-ProcessWithLog -Name "API Server" -Path $apiServerDir -Command "pnpm run dev"

        # Start Frontend
        $frontendPid = Start-ProcessWithLog -Name "Frontend" -Path $frontendDir -Command "pnpm run dev"

        # Store PIDs
        "API_SERVER_PID=$apiPid" | Out-File $pidFile -Append
        "FRONTEND_PID=$frontendPid" | Out-File $pidFile -Append

        Write-Host "Job-Pilot system started!" -ForegroundColor Green
        Write-Host "API Server: http://localhost:3001" -ForegroundColor White
        Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
        Write-Host "`nUse './run.ps1 stop' to shut down the system" -ForegroundColor Yellow
    }
    catch {
        Write-Host "Failed to start Job-Pilot: $_" -ForegroundColor Red
        Stop-System
        exit 1
    }
}

function Stop-System {
    if (-not (Test-Path $pidFile)) {
        Write-Host "No running Job-Pilot instances found" -ForegroundColor Yellow
        return
    }

    Write-Host "Shutting down Job-Pilot system..." -ForegroundColor Cyan

    # Read PID file
    $pids = Get-Content $pidFile

    foreach ($line in $pids) {
        if ($line -match "^([^_]+)_PID=(.+)$") {
            $name = $matches[1]
            $pid = $matches[2]

            try {
                Write-Host "Stopping $name (PID $pid)..." -ForegroundColor White

                # Get the process
                $process = Get-Process -Id $pid -ErrorAction SilentlyContinue

                if ($process) {
                    # Kill the process and children
                    Stop-Process $pid -Force
                    Write-Host "$name stopped successfully" -ForegroundColor Green
                } else {
                    Write-Host "$name not running" -ForegroundColor Yellow
                }
            }
            catch {
                Write-Host "Failed to stop $name: $_" -ForegroundColor Red
            }
        }
    }

    # Remove PID file
    if (Test-Path $pidFile) { Remove-Item $pidFile -Force }

    Write-Host "Job-Pilot system stopped" -ForegroundColor Green
}

# Execute requested action
try {
    switch ($action) {
        "start" {
            Start-System
        }
        "stop" {
            Stop-System
        }
        default {
            Write-Host "Usage: ./run.ps1 [start|stop]" -ForegroundColor Yellow
            Write-Host "Example:" -ForegroundColor White
            Write-Host "  Start: ./run.ps1 start" -ForegroundColor White
            Write-Host "  Stop:  ./run.ps1 stop" -ForegroundColor White
            exit 1
        }
    }
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}