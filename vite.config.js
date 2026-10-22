import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'./',plugins:[react()],optimizeDeps:{entries:['index.html']},build:{outDir:'dist',sourcemap:false},server:{host:'127.0.0.1',port:4345,strictPort:true,watch:{ignored:['**/.build-cache/**','**/.test-data/**','**/resources/**','**/release/**']}}});
