import json

from vault.main import app

print(json.dumps(app.openapi()))
