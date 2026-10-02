#!/bin/sh
# O site acompanha o main do GitHub.
#
# Roda de minuto em minuto pelo cron. Só mexe em disco quando o main mudou — sem
# commit novo, ele sai calado. O repositório é público, então não há chave nenhuma
# guardada aqui.
#
#   * * * * * /docker/site/atualizar.sh >> /var/log/site-atualizar.log 2>&1

set -eu
PASTA=/docker/site/eterno-dourado

cd "$PASTA"
git fetch --quiet origin main

ANTES=$(git rev-parse HEAD)
DEPOIS=$(git rev-parse origin/main)
[ "$ANTES" = "$DEPOIS" ] && exit 0

git reset --hard --quiet origin/main
echo "$(date '+%F %T') site atualizado: ${ANTES%${ANTES#???????}} → ${DEPOIS%${DEPOIS#???????}}"

# a configuração do nginx vem do git como todo o resto: mudou, o nginx relê
if ! cmp -s "$PASTA/publicacao/nginx.conf" /docker/site/nginx.conf 2>/dev/null; then
  cp "$PASTA/publicacao/nginx.conf" /docker/site/nginx.conf
  echo "configuração do nginx atualizada"
fi

# o nginx serve os arquivos direto do disco: só a configuração precisa ser relida
docker exec eterno-dourado-site nginx -s reload >/dev/null 2>&1 || true
