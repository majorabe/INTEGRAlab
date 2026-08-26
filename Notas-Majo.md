1- Confirmar que el número de bloques sigue creciendo desde una terminal
curl -s http://localhost:3003/verify-integrity

Esto le pregunta al nodo hospital-donante (puerto 3003): "recorré todo tu ledger y decime si la cadena de hashes sigue intacta". Como el simulador IoT sigue mandando una lectura nueva cada 5 segundos, cada vez que corras este comando el length debería ser un número más alto que la vez anterior, y valid debería seguir en true.

watch -n 3 "curl -s http://localhost:3003/verify-integrity" para verlo correr en vivo.

2- Comparar los 4 nodos al mismo tiempo
Esto es lo importante: correr el mismo chequeo contra los 4 puertos, uno por uno, para ver si todos tienen la misma cantidad de bloques:

bash
echo "coordinador-nacional:"
curl -s http://localhost:3001/verify-integrity
echo ""
echo "coordinador-provincial:"
curl -s http://localhost:3002/verify-integrity
echo ""
echo "hospital-donante:"
curl -s http://localhost:3003/verify-integrity
echo ""
echo "hospital-receptor:"
curl -s http://localhost:3004/verify-integrity

Qué esperar: los 4 deberían decir valid: true, y el length de los 4 debería ser igual o muy parecido entre sí.

3- PARA PAUSAR/RESTAURAR LA GENERACION DE INFO DE IOT
docker compose stop iot-simulator
o
docker compose start iot-simulator


4- Empezar de cero para una nueva ronda de pruebas limpia.
El flujo para cada ronda de pruebas queda simple: 
./scripts/reset.sh --force 
→ docker compose up --build. 
Cuando avancemos con la suite de tests automatizados (Tanda 2b), ese script también va a vivir en scripts/ junto a este.