import{j as r,m as d,I as h}from"./index-CCZsVKnf.js";const l={primary:"bg-accent text-white hover:bg-red-700 shadow-lg shadow-red-900/30",secondary:"bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm",ghost:"text-white hover:bg-white/10",outline:"border border-white/20 text-white hover:border-white/40 hover:bg-white/5"},m={sm:"px-3 py-1.5 text-sm rounded-md",md:"px-5 py-2.5 text-sm rounded-lg",lg:"px-8 py-3.5 text-base rounded-xl"},p=({variant:s="primary",size:o="md",loading:e=!1,disabled:t,children:i,className:a="",...n})=>r.jsxs(d.button,{whileHover:!t&&!e?{scale:1.02}:void 0,whileTap:!t&&!e?{scale:.98}:void 0,className:`
        inline-flex items-center justify-center gap-2 font-semibold
        transition-colors duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${l[s]} ${m[o]} ${a}
      `,disabled:t||e,...n,children:[e&&r.jsx(h,{name:"progress_activity",className:"w-4 h-4 animate-spin"}),i]});export{p as B};
