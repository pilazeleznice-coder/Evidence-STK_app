#!/usr/bin/env python3
"""Update the offline mirror from allowlisted manufacturer catalogues.
No vehicle/customer data are read. Failed sources never erase existing records.
Usage: python scripts/update_manufacturer_catalog.py [--brand agados]
There is no background scheduler or request sent while users type in the app.
"""
import argparse, concurrent.futures, datetime, hashlib, html, json, re, urllib.request, subprocess, unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def clean(value):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',value))).strip()
def compact(value):return re.sub('[^a-z0-9+]','',unicodedata.normalize('NFKD',value.casefold()))
def extract(feed,body):
 parser=feed['parser']
 if feed.get('format')=='pdf':body=subprocess.run(['pdftotext','-layout','-','-'],input=body,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=30).stdout
 text=body.decode('utf-8',errors='replace');rows=[]
 if parser=='seeds':
  flattened=compact(clean(text))
  rows=[(model,'model') for model in feed.get('models',[]) if compact(model) in flattened]
 elif parser=='agados':
  # Only names present in the actual manufacturer's stock catalogue.
  for name in re.findall(r'\b(?:HANDY[ -]\d+|VZ[ -]\d+|ALUX[ -]?\d+|AGA KIT [A-Z]{1,2}\d+)\b',clean(text),re.I):
   name=name.upper();name=re.sub(r'^(HANDY|VZ|ALUX)[ -]?(\d+)$',r'\1-\2',name);rows.append((name,'model'))
 elif parser=='jawa':
  names=re.findall(r'class="cGallery__title[^>]*>(.*?)</div>',text,re.S)
  for value in names[:40]:
   name=re.sub(r'^\d{4}\s+','',clean(value));name=re.sub(r'^JAWA[ ,]*','',name,flags=re.I)
   if name and len(name)<85 and 'VELOREX' not in name and name!='700':rows.append((name,'model'))
 elif parser=='manitou':
  for name in re.findall(r'<h[1-5][^>]*>(.*?)</h[1-5]>',text,re.S):
   name=clean(name)
   if re.fullmatch(r'MLT-X\s+\d{3,4}',name):rows.append((name,'model'))
 elif parser=='zetor':
  for value in re.findall(r'<h2[^>]*>(.*?)</h2>',text,re.S):
   name=re.sub(r'^Zetor\s+','',clean(value),flags=re.I)
   if name.casefold() in {'compax','major','proxima','forterra','crystal','řada 5','řada 6','5'}:rows.append(('Řada 5' if name=='5' else name,'series'))
 else:raise ValueError('Unknown parser')
 out={compact(n):(n,l) for n,l in rows}
 if not 1<=len(out)<=150:raise ValueError('Unexpected model count: '+str(len(out)))
 return list(out.values())
def fetch(feed):
 req=urllib.request.Request(feed['url'],headers={'User-Agent':'Evidence-STK-Catalog/1.0 (manufacturer identifiers; contact via repository)'})
 with urllib.request.urlopen(req,timeout=25) as response:
  if not response.url.startswith('https://'):raise ValueError('HTTPS redirect required')
  limit=25_000_000 if feed.get('format')=='pdf' else 3_000_000
  body=response.read(limit+1)
  if len(body)>limit:raise ValueError('Catalogue page too large')
  return body
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--brand',action='append');args=ap.parse_args()
 registry=json.loads((ROOT/'manufacturer-sources.json').read_text());data=json.loads((ROOT/'vehicle-catalog.json').read_text());now=datetime.datetime.now(datetime.timezone.utc).isoformat();makes={m[0]:m for m in data['makes']};existing={(r[0],compact(r[1])):r for r in data['models']};report=[]
 jobs=[(brand,feed) for brand in registry['manufacturers'] if not args.brand or brand['slug'] in args.brand for feed in brand['feeds']]
 def run(job):
  brand,feed=job
  try:
   body=fetch(feed);return brand,feed,extract(feed,body),hashlib.sha256(body).hexdigest(),None
  except Exception as e:return brand,feed,[],None,str(e)
 for brand,feed,rows,digest,error in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(run,jobs):
  feed['checkedAt']=now;feed['status']='unavailable' if error else 'ok'
  if error:report.append({'brand':brand['slug'],'error':error});continue
  feed['sha256']=digest;feed['importedAt']=now;brand['verifiedAt']=now[:10]
  for name,level in rows:
   slug=brand['slug'];kind=makes[slug][3]['kind'];key=(slug,compact(name));meta={'verification':feed.get('verification','official-catalog'),'level':level,'verifiedAt':now[:10]}
   if key in existing:
    record=existing[key]
    while len(record)<5:record.append(None)
    record[3]=feed['url'];record[4]=meta
   else:
    record=[slug,name,kind,feed['url'],meta];data['models'].append(record);existing[key]=record
  report.append({'brand':brand['slug'],'modelsInFeed':len(rows)})
 for brand in registry['manufacturers']:
  make=makes[brand['slug']];make[2]=brand['logo'];make[3].update({k:brand[k] for k in ['manufacturer','country','catalog','logoStatus','verifiedAt'] if k in brand})
 data['manufacturerSources']=registry['manufacturers'];data['version']='2026.11.08.5';registry['updated']=now[:10]
 (ROOT/'vehicle-catalog.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 (ROOT/'manufacturer-sources.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
