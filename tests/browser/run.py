"""Start an isolated temporary real server and exercise UI. No production DB touched."""
from pathlib import Path
import os,subprocess,tempfile,socket,time,urllib.request,secrets,sys
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='threadline-ui-') as d:
 with socket.socket() as s:
  s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 origin=f'http://localhost:{port}'
 env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1','NODE_ENV':'development','APP_ORIGIN':'','OPENAI_API_KEY':'','REGISTRATION_TOKEN':secrets.token_hex(24),'THREADLINE_DB':str(Path(d)/'test.sqlite')}
 env['THREADLINE_TEST_INVITATION']=env['REGISTRATION_TOKEN'];env['THREADLINE_TEST_ORIGIN']=origin
 with open(Path(d)/'server.log','w') as log:
  server=subprocess.Popen(['node','server.js'],cwd=root,env=env,stdout=log,stderr=log)
  try:
   for _ in range(100):
    try:
     if urllib.request.urlopen(origin+'/api/health',timeout=1).status==200:break
    except Exception:time.sleep(.1)
   else:raise RuntimeError('Temporary server did not start.')
   result=subprocess.run([sys.executable,str(root/'tests/browser/ui_check.py')],cwd=root,env=env)
   sys.exit(result.returncode)
  finally:
   server.terminate()
   try:server.wait(timeout=10)
   except subprocess.TimeoutExpired:server.kill();server.wait()
