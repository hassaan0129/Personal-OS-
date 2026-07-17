$ErrorActionPreference = "Stop"
python "$PSScriptRoot\verify.py" @args
exit $LASTEXITCODE
