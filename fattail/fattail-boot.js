/* fattail-boot.js — 필수 파일 확인
   fattail-core.js 가 없으면 화면이 조용히 비어 버리므로 안내를 띄웁니다. */

if(typeof FT_ALL_GENES==='undefined'){
  document.addEventListener('DOMContentLoaded',function(){
    document.body.innerHTML='<div style="max-width:520px;margin:60px auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;background:#FDFCF9;border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.08);line-height:1.7;color:#26221D">'
      +'<div style="font-size:34px;text-align:center">⚠️</div>'
      +'<h2 style="text-align:center;font-size:18px;margin:10px 0">필수 파일이 없습니다</h2>'
      +'<p style="font-size:14px;color:#6C6452"><b>fattail-core.js</b> 파일을 찾을 수 없어요. 이 파일에 모프 데이터와 계산 엔진이 들어 있습니다.</p>'
      +'<p style="font-size:14px;color:#6C6452"><b>해결 방법</b><br><b>fattail-core.js</b> 를 <b>index.html 과 같은 폴더(fattail/)</b>에 올린 뒤 새로고침해 주세요.</p>'
      +'</div>';
  });
}
