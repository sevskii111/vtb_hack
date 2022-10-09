import json
from pathlib import Path
import pandas as pd
import pickle
from sklearn.cluster import KMeans
import numpy as np


def get_all_news():
    news = {}
    news_dir = Path('news')
    sources = news_dir.glob('**/')
    next(sources)
    for source in sources:
        news[source.name] = []
        news_files = source.glob('*.json')
        for news_file in news_files:
            with news_file.open() as news_file:
                news[source.name] += json.load(news_file)
    return news

def get_news_df():
    news = get_all_news()
    content_list = []
    dates = []
    links = []
    titles = []
    for source in news:
        for n in news[source]:
            string_content = f"{n['title']} {n['text']}"
            dates.append(n['timestamp'])
            content_list.append(string_content)
            links.append(n['full_link'])
            titles.append(n['title'])
    news_df = pd.DataFrame({'document': content_list, 'dates': dates, 'links': links, 'titles': titles})
    news_df.dropna(inplace=True)
    news_df['dates'] = news_df['dates'].apply(lambda t: t.split('+')[0])
    news_df['dates'] = pd.to_datetime(news_df['dates'])
    return news_df

def clean_news(df):
    clean_doc = df['document'].str.replace("[^a-zA-Zа-яА-Я#]", " ")
    clean_doc = clean_doc[clean_doc.notnull()]
    clean_doc = clean_doc.apply(lambda x: ' '.join([w for w in x.split() if len(w)>3]))
    clean_doc = clean_doc.apply(lambda x: x.lower())

    return clean_doc

def vecotorize(news):
    with open('vectorizer', 'rb') as vectorizer_file:
        vectorizer = pickle.load(vectorizer_file)
    return vectorizer.transform(news)

def get_top_tf_idf_words(terms, response, top_n=2):
    sorted_nzs = np.argsort(response.data)[:-(top_n+1):-1]
    return np.array(terms)[response.indices[sorted_nzs]]

def get_clusters(start_date, end_date):
    news_df = get_news_df()

    news_df = news_df[(news_df.dates >= np.datetime64(start_date)) & (news_df.dates <= np.datetime64(end_date))]

    c_news = clean_news(news_df)
    v_news = vecotorize(c_news)

    with open('vectorizer', 'rb') as vectorizer_file:
        vectorizer = pickle.load(vectorizer_file)

    with open('svd', 'rb') as svd_file:
        svd = pickle.load(svd_file)

    with open('u', 'rb') as u_file:
        u = pickle.load(u_file)

    embedding = u.transform(svd.transform(v_news))
    n_clusters = 10
    km = KMeans(n_clusters=n_clusters)
    km.fit(embedding)

    clusters = km.labels_

    result = []
    for i in range(n_clusters):
        cluster_docs = clusters == i

        top_words = set(get_top_tf_idf_words(vectorizer.get_feature_names(), v_news[cluster_docs], 10))
        news = news_df[cluster_docs].iloc[:10]
        result.append({'key_words': top_words, 'news': news[['dates', 'titles', 'links']].to_dict(orient="index")})

    return result
    