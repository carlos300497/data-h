#!/bin/bash

cd /ruta/a/tu/proyecto || exit

# Fuerza eliminar todos los cambios locales
git reset --hard HEAD

# Trae la última versión desde GitHub
git fetch origin

# Cambia a tu rama principal (ajusta "main" si es otra)
git checkout main

# Sincroniza la rama local con la remota
git reset --hard origin/main

echo "✅ Proyecto sincronizado con la versión online."
