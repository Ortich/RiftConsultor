---
description: Pasos para debatir un cambio de mazo contra la estrategia guardada y el catálogo local, sin inventar el meta.
---

# Debatir un mazo

Úsala cuando el usuario quiera mejorar un mazo, comparar dos listas o decidir si una carta entra.

1. Llama a `catalog_status`. Si `paused` es true, repite el `message` y termina. No sigas estos pasos.
2. Lee el mazo con `get_deck` si ya tiene id. Si no existe, pide leyenda, campeón elegido y el plan en una frase.
3. Repite la estrategia con sus palabras. Si `strategy` está vacío, no propongas cambios todavía: pide el plan.
4. Si el cambio se justifica «porque el meta», usa solo `meta` o lo que el usuario acabe de decir. Si no hay ninguno, pregunta a qué mazos se enfrenta.
5. Antes de nombrar una carta que entra o sale, recupérala con `get_card`. Usa el `name` que devuelve la herramienta, no un alias.
6. Comprueba el hueco: qué copia sale, qué dominio pide la nueva, y si mueve el cupo de Signature (máximo 3).
7. Llama a `save_deck` sin `commit` cuando la lista nueva esté completa y quieras ver los errores. Enseña `errors` tal cual, en corto.
8. No llames a `save_deck` con `commit: true` hasta que el usuario diga que quiere guardar esa versión. Un mazo ilegal se puede guardar si lo pide, y tienes que decir que no es legal.
9. Cierra con una sola pregunta: la decisión que falta, no un resumen de todo el mazo.
