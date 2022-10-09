from datetime import datetime
from fastapi import FastAPI
from utils import get_all_news, get_clusters

app = FastAPI()

@app.get("/stats")
def stats():
    all_news = get_all_news()
    return {source: len(news) for source, news in all_news.items()}

@app.get('/digest')
def digest(start_time: datetime, end_time: datetime):
    return get_clusters(start_time, end_time)
