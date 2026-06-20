FROM redis:7-alpine

COPY start.sh /start.sh
RUN chmod +x /start.sh

VOLUME ["/data"]
EXPOSE 6379

ENTRYPOINT ["/start.sh"]
