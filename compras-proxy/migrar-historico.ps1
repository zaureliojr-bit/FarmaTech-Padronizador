param(
 [Parameter(Mandatory=$true)][string]$Url,
 [switch]$Executar
)
$ErrorActionPreference = "Stop"
$base = [Uri]$Url
if ($base.Scheme -ne "https" -or $base.AbsolutePath -ne "/" -or $base.Query -or $base.Fragment -or $base.UserInfo) { throw "Informe a URL HTTPS raiz do Worker." }
$secure = Read-Host "Chave master de compras" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
 $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 if ($token -notmatch '^[a-fA-F0-9]{64}$') { throw "Formato da chave invalido." }
 $headers = @{Authorization="Bearer $token"}
 $root = $base.AbsoluteUri.TrimEnd('/')
 $lotes = @()
 $cursor = ""
 do {
  $r = Invoke-RestMethod -Method Get -Uri ($root+"/compras/inc/migracao?cursor="+[Uri]::EscapeDataString($cursor)) -Headers $headers
  $lotes += @($r.lotes)
  $cursor = [string]$r.cursor
 } while ($cursor)
 $lotes | Format-Table loja,lote,extraido_em,notas,itens,migrado -AutoSize
 if (!$Executar) { Write-Host "Somente inventario. Nenhum dado alterado."; return }
 foreach ($l in $lotes) {
  if ($l.migrado -eq 1) { Write-Host ("Ja publicado: "+$l.loja+" "+$l.lote); continue }
  $pos = 0L
  $n = 0
  do {
   $body = @{loja=$l.loja;lote=$l.lote;cursor=$pos} | ConvertTo-Json -Compress
   $r = Invoke-RestMethod -Method Post -Uri ($root+"/compras/inc/migrar") -Headers $headers -ContentType "application/json" -Body $body
   if (!$r.ok) { throw "Falha na migracao." }
   if (!$r.concluido) {
    if ([long]$r.cursor -le $pos -or [int]$r.processadas -le 0) { throw "Cursor nao avancou." }
    $pos = [long]$r.cursor
    $n += [int]$r.processadas
    Write-Host ($l.loja+": "+$n+"/"+$l.notas+" notas")
   }
  } until ($r.concluido)
  if ($r.notas -ne $l.notas -or $r.itens -ne $l.itens) { throw "Contagem final divergente." }
  Write-Host ("Conferido: "+$l.loja+" - "+$r.notas+" notas / "+$r.itens+" itens")
 }
 Write-Host "Migracao concluida. Tabelas originais preservadas."
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
 Remove-Variable token,headers -ErrorAction SilentlyContinue
}
