import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';import fs from 'fs';
const n=['DEPLOYER','TREASURY','USER','MERCHANT'];let s='';const pub={};
for(const k of n){const p=generatePrivateKey();s+=`${k}_PK=${p}\n`;pub[k]=privateKeyToAccount(p).address}
if(!fs.existsSync('.env'))fs.writeFileSync('.env',s,{mode:0o600});console.log(pub)
