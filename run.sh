#!/bin/bash
docker run -p 8080:80 -v $(pwd)/src:/usr/share/nginx/html va-app
