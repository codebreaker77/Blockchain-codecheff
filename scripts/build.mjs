import {build} from 'vite';
import fs from 'node:fs';
await build({root:'web'});
if(fs.existsSync('web/deployment.json'))fs.copyFileSync('web/deployment.json','web/dist/deployment.json');
