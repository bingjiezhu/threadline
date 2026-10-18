"""Build the current clean merged source distribution; never copy runtime/private data."""
from pathlib import Path
import hashlib,json,re,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'deliverables'
ARCHIVE=OUT/'Threadline_Final_Source.zip'
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 banned={'.git','.runtime','.data','.env','node_modules','__pycache__','artifacts','release-evidence','backups','.media-venv','.venv'}
 excluded={'.sqlite','.sqlite3','.db','.mp4','.webm','.mov','.mp3','.wav','.aiff','.aif','.pptx','.pdf','.woff','.woff2','.ttf','.otf','.log','.jsonl','.pyc','.zip'}
 payload={}
 for p in sorted(ROOT.rglob('*')):
  if not p.is_file() or p.is_symlink():continue
  rel=p.relative_to(ROOT)
  if any(part in banned for part in rel.parts)or p.name=='.DS_Store'or p.suffix.lower()in excluded or p.name in {'SOURCE_MANIFEST.json','SOURCE_ARCHIVE_RECEIPT.json','LOCAL_AGENT_INFO.json','LOCAL_ACCEPTANCE.json','PROGRESS.json','ASI_ACCEPTANCE.json','REGISTRATION_FIRST_FAILURE.json'}:continue
  if p.name.startswith('.env')and p.name!='.env.example':continue
  data=p.read_bytes()
  if re.search(rb'sk-(?:proj-)?[A-Za-z0-9_-]{35,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ya29\.[A-Za-z0-9_-]{30,}|pho_(?:sk|ask)_[A-Za-z0-9_-]{16,}',data):raise RuntimeError('Possible secret format in '+str(rel))
  payload[rel.as_posix()]=data
 manifest={'schema_version':1,'project':'Threadline','application_version':'1.3.2','edition':'Personal relationship workspace merged release','authority':'Threadline_Final is the canonical editable tree','files':[{'path':n,'bytes':len(d),'sha256':sha(d)}for n,d in payload.items()],'excluded':['runtime data','credentials','media','fonts','dependency caches','release evidence']}
 mb=(json.dumps(manifest,indent=2)+'\n').encode()
 with zipfile.ZipFile(ARCHIVE,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for n,d in [*payload.items(),('SOURCE_MANIFEST.json',mb)]:
   i=zipfile.ZipInfo('Threadline/'+n,date_time=(2026,10,18,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,d)
 receipt={'archive':str(ARCHIVE.relative_to(ROOT.parent)),'bytes':ARCHIVE.stat().st_size,'sha256':sha(ARCHIVE.read_bytes()),'payload_files':len(payload),'manifest_sha256':sha(mb),'timestamp_note':'Fixed ZIP timestamp is reproducibility metadata, not development-window evidence.'}
 evidence=ROOT.parent/'_organizer/final-merge/code';evidence.mkdir(parents=True,exist_ok=True)
 (evidence/'SOURCE_MANIFEST.json').write_bytes(mb);(evidence/'SOURCE_ARCHIVE_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
