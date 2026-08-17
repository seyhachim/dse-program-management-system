from pathlib import Path

source_path = Path('.github/scripts/issue208_apply.py')
source = source_path.read_text()
start = source.index('# Dedicated DB regression runs on fresh PostgreSQL before DB-security verification.')
source = source[:start]
source += '''# Remove temporary Python patch transport only; the workflow is removed through the connector.\nPath(".github/scripts/issue208_apply.py").unlink()\nPath(".github/scripts/issue208_apply_wrapper.py").unlink()\n'''
exec(compile(source, str(source_path), 'exec'))
