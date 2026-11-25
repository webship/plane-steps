#!/usr/bin/env bash
# Build the test site of this pack in a DDEV project: Plane's all-in-one image of the Community Edition on the
# project's own PostgreSQL, with Valkey, RabbitMQ and an S3 store (MinIO) beside it, its instance set up, the accounts
# of the suite as members of the workspace webship and its project Webship site (WEB), and the sample content the
# features read (its work items, its cycle "Sprint 1", the label "bug" and a comment). It is what CI runs; on a machine
# with Docker, DDEV and 4 GB of free memory it makes the same site.
#
#   SITE_DIR=<folder>        where the project goes (default: ../plane-site beside the pack)
#   RELEASE=<vX.Y.Z>         the release of the image (default: v1.5.1)
#   COUNTS_ONLY=1            build nothing: print what the site holds, one count a line (a run must leave them)
#
# The site answers at https://planesteps.ddev.site, the address cucumber.js opens by default. Its own values (its secret
# keys, the keys of its queue and its store) are made for it, in $SITE_DIR/plane/, never printed. The site script
# (site/plane-site.py) and the start of Plane's container (site/plane-start.sh) are the ones of the Webship Workspace's
# Plane plugin.
set -euo pipefail

PACK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_DIR="${SITE_DIR:-${PACK}/../plane-site}"
NAME=planesteps
RELEASE="${RELEASE:-v1.5.1}"
IMAGE="docker.io/makeplane/plane-aio-community:${RELEASE}"
PASSWORD='dD.123123ddd'

# The site script, with Django's own shell in Plane's container; its input reaches it.
site() {
  local out status
  out="$(docker exec -i -e PLANE_VERBS="$*" "ddev-${NAME}-plane" sh -c 'cd /app/backend && python manage.py shell -c "exec(open(\"/opt/webship/plane-site.py\").read())"' 2>&1)" && status=0 || status=$?
  printf '%s\n' "${out}" | grep -v 'objects imported automatically' || true
  return "${status}"
}

if [ "${COUNTS_ONLY:-}" = 1 ] ; then
  site counts < /dev/null | grep -E '^[a-z ]+: [0-9]+$'
  exit 0
fi

secret() { head -c 200 /dev/urandom | base64 -w0 | tr -dc 'A-Za-z0-9' | head -c "$1" ; }

mkdir -p "${SITE_DIR}/plane" "${SITE_DIR}/.ddev"
SITE_DIR="$(cd "${SITE_DIR}" && pwd)"
cd "${SITE_DIR}"
ddev config --project-type=generic --project-name="${NAME}" --database=postgres:15 < /dev/null

cp "${PACK}/site/plane-site.py" "${PACK}/site/plane-start.sh" plane/
mq="$(secret 32)" ; store_user="plane$(secret 12)" ; store_key="$(secret 40)"
( umask 077
  cat > plane/env <<ENVEOF
PLANE_RELEASE=${RELEASE}
DOMAIN_NAME=${NAME}.ddev.site
APP_DOMAIN=${NAME}.ddev.site
APP_PROTOCOL=https
SITE_ADDRESS=:80
WEB_URL=https://${NAME}.ddev.site
CORS_ALLOWED_ORIGINS=https://${NAME}.ddev.site
DATABASE_URL=postgresql://db:db@db:5432/db
REDIS_URL=redis://valkey:6379/
AMQP_URL=amqp://plane:${mq}@rabbitmq:5672/plane
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=${store_user}
AWS_SECRET_ACCESS_KEY=${store_key}
AWS_S3_BUCKET_NAME=uploads
AWS_S3_ENDPOINT_URL=http://minio:9000
SECRET_KEY=$(secret 64)
LIVE_SERVER_SECRET_KEY=$(secret 64)
GUNICORN_WORKERS=1
AUTHENTICATION_RATE_LIMIT=100/minute
ENVEOF
  printf 'RABBITMQ_DEFAULT_USER=plane\nRABBITMQ_DEFAULT_PASS=%s\nRABBITMQ_DEFAULT_VHOST=plane\n' "${mq}" > plane/rabbitmq.env
  printf 'MINIO_ROOT_USER=%s\nMINIO_ROOT_PASSWORD=%s\n' "${store_user}" "${store_key}" > plane/minio.env
)
mq='' ; store_user='' ; store_key=''
printf 'PLANE_IMAGE=%s\n' "${IMAGE}" > .ddev/.env
cat > .ddev/docker-compose.plane.yaml <<'YAMLEOF'
# Plane: its all-in-one image on the project's PostgreSQL, with Valkey, RabbitMQ and an S3 store beside it, at the
# project's address; the project's web container keeps the mail catcher. The same services as the Webship Workspace's
# Plane plugin.
services:
  web:
    environment:
      - HTTP_EXPOSE=8093:80,8025:8025
      - HTTPS_EXPOSE=8457:80,8026:8025
  plane:
    image: "${PLANE_IMAGE:-docker.io/makeplane/plane-aio-community:v1.5.1}"
    container_name: ddev-${DDEV_SITENAME}-plane
    labels:
      com.ddev.site-name: ${DDEV_SITENAME}
      com.ddev.approot: ${DDEV_APPROOT}
    restart: "no"
    expose:
      - "80"
    depends_on:
      db:
        condition: service_healthy
      valkey:
        condition: service_started
      rabbitmq:
        condition: service_started
      minio:
        condition: service_started
    env_file:
      - ${DDEV_APPROOT}/plane/env
    # The image starts from its own settings file: the site's login limit goes into it first.
    command: ["sh", "/opt/webship/plane-start.sh"]
    volumes:
      - ${DDEV_APPROOT}/plane:/opt/webship:ro
    environment:
      VIRTUAL_HOST: ${DDEV_HOSTNAME}
      HTTP_EXPOSE: "80:80"
      HTTPS_EXPOSE: "443:80"
  valkey:
    image: "docker.io/valkey/valkey:7.2.11-alpine"
    container_name: ddev-${DDEV_SITENAME}-valkey
    labels:
      com.ddev.site-name: ${DDEV_SITENAME}
      com.ddev.approot: ${DDEV_APPROOT}
    restart: "no"
    expose:
      - "6379"
  rabbitmq:
    image: "docker.io/library/rabbitmq:3.13.6-alpine"
    container_name: ddev-${DDEV_SITENAME}-rabbitmq
    labels:
      com.ddev.site-name: ${DDEV_SITENAME}
      com.ddev.approot: ${DDEV_APPROOT}
    restart: "no"
    expose:
      - "5672"
    env_file:
      - ${DDEV_APPROOT}/plane/rabbitmq.env
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
  minio:
    image: "docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z"
    container_name: ddev-${DDEV_SITENAME}-minio
    labels:
      com.ddev.site-name: ${DDEV_SITENAME}
      com.ddev.approot: ${DDEV_APPROOT}
    restart: "no"
    command: server /export --console-address ":9090"
    expose:
      - "9000"
    env_file:
      - ${DDEV_APPROOT}/plane/minio.env
    volumes:
      - minio_data:/export
volumes:
  rabbitmq_data:
    name: ddev-${DDEV_SITENAME}-plane-rabbitmq
  minio_data:
    name: ddev-${DDEV_SITENAME}-plane-minio
YAMLEOF

echo "Starting Plane ${RELEASE}: the first start migrates the database."
ddev start -y < /dev/null
code=''
for attempt in $(seq 1 200) ; do
  code="$(ddev exec "curl -s -o /dev/null -m 10 -w '%{http_code}' http://plane:80/api/instances/" < /dev/null 2>/dev/null | tr -d '\r' | tail -1 || true)"
  [ "${code}" = 200 ] && break
  [ "${attempt}" = 200 ] && { echo "Plane did not answer (${code:-none})." ; ddev logs -s plane --tail 80 < /dev/null || true ; exit 1 ; }
  sleep 3
done

# The instance set up the way a person would on its first screen, then the accounts of the suite (owner is an Admin of
# the project, member a Member, reader a Guest, stranger no member) and the sample content.
site defaults < /dev/null
ddev exec "curl -s -m 10 http://plane:80/api/instances/" < /dev/null | tr -d '\r' | grep -q '"is_setup_done": *true' \
  || { echo "Plane still answers that its instance is not set up." ; exit 1 ; }
python3 - "${PASSWORD}" <<'PYEOF' | site accounts content list
import base64, json, sys
password = sys.argv[1]
rows = [{'login': login, 'mail': login + '@example.com', 'password': password, 'fullname': login.capitalize() + ' Test',
         'admin': False, 'role': role, 'action': ''}
        for login, role in [('owner', 'Admin'), ('member', 'Member'), ('reader', 'Guest'), ('stranger', '')]]
print(base64.b64encode(json.dumps(rows).encode()).decode())
PYEOF

echo "The site: https://${NAME}.ddev.site (Plane ${RELEASE})"
[ -n "${GITHUB_ENV:-}" ] && echo "LAUNCH_URL=https://${NAME}.ddev.site" >> "${GITHUB_ENV}"
exit 0
