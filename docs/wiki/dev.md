本地 Docker 跑 DSA、大模型走宿主机 Ollama，核心是：容器里不要用 localhost 指 Ollama，应指向宿主机。

  1. 宿主机先启动 Ollama

  # 安装后启动（若尚未运行）
  ollama serve
  # 拉取要用的模型
  ollama pull qwen3:8b

  确认本机可访问：

  curl http://127.0.0.1:11434/api/tags

  2. 配置 .env

  cp .env.example .env

  在 .env 里用下面任一方式（推荐渠道模式）：

  # 推荐：渠道模式
  LLM_CHANNELS=ollama
  LLM_OLLAMA_BASE_URL=http://host.docker.internal:11434
  LLM_OLLAMA_MODELS=qwen3:8b
  # 或：LiteLLM 直连
  # OLLAMA_API_BASE=http://host.docker.internal:11434
  # LITELLM_MODEL=ollama/qwen3:8b

  要点：
  • 不要用 OPENAI_BASE_URL 配 Ollama（会拼错 URL）
  • Docker 内 localhost / 127.0.0.1 是容器自己，必须用 host.docker.internal
  • 可再配自选股等，例如 STOCK_LIST=600519,AAPL

  3. Linux 让容器能访问宿主机

  当前 docker/docker-compose.yml 默认没有 extra_hosts。在 Linux 上可临时加，或用 docker run：

  方式 A：改 compose（推荐本地）

  在 server 服务下增加：

  extra_hosts:
    - "host.docker.internal:host-gateway"

  方式 B：docker run

  docker run -d \
    --name dsa-server \
    --env-file .env \
    --add-host=host.docker.internal:host-gateway \
    -p 8000:8000 \
    -v "$(pwd)/data:/app/data" \
    -v "$(pwd)/logs:/app/logs" \
    -v "$(pwd)/reports:/app/reports" \
    -e WEBUI_HOST=0.0.0.0 \
    zhulinsen/daily_stock_analysis:latest \
    python main.py --serve-only --host 0.0.0.0 --port 8000

  macOS / Windows Docker Desktop 一般自带 host.docker.internal，可不加 extra_hosts。

  4. 启动 Web 服务

  # 源码构建启动（推荐开发）
  docker compose -f ./docker/docker-compose.yml up -d server
  # 看日志
  docker compose -f ./docker/docker-compose.yml logs -f server

  浏览器打开：http://localhost:8000

  5. 联通性自检

  容器内测 Ollama：

  docker exec stock-server curl -s http://host.docker.internal:11434/api/tags

  若失败，再确认：
  1. 宿主机 Ollama 在跑，且监听 0.0.0.0:11434（不只是 loopback）
  2. Linux 已加 host.docker.internal:host-gateway
  3. 防火墙未拦 11434

  也可在 Web：系统设置 → AI 模型 → 测试连接。

  ────────────────────────────────────────

  常用命令

  ┌─────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │ 操作        │ 命令                                                                                                                       │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 启动 Web    │ docker compose -f ./docker/docker-compose.yml up -d server                                                                 │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 看日志      │ docker compose -f ./docker/docker-compose.yml logs -f server                                                               │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 停止        │ docker compose -f ./docker/docker-compose.yml down                                                                         │
  ├─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 改代码后重  │ docker compose -f ./docker/docker-compose.yml build --no-cache && docker compose -f ./docker/docker-compose.yml up -d      │
  │ 建          │ server                                                                                                                     │
  └─────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  更细的 LLM 配置见 docs/LLM_CONFIG_GUIDE.md，Docker 部署见 docs/full-guide.md 的「Docker 部署」一节。