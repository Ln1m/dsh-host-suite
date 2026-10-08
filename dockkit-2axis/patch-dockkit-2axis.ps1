param(
  [switch]$Revert,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$Root      = if ($env:DSH_ROOT) { $env:DSH_ROOT } else { Join-Path $HOME 'DeepSeek_harness' }
$Nb        = Join-Path $Root 'node_modules\@deepseek-ai'
$BkRoot    = Join-Path $Root 'backups'
$TmpDir    = Join-Path $Root 'tmp'
$Utf8      = New-Object System.Text.UTF8Encoding($false)
$Cap       = '8'

$SidebarFile = Join-Path $Nb 'dsh-client-ui-sidebar-right\lib\client.js'
$DistDir     = Join-Path $Nb 'dsh-web-frontend\dist'
$HtmlFile    = Join-Path $DistDir 'index.html'
$VkSrc       = Join-Path $Root 'plugins\dsh-vk-layout\lib\client.js'
$VkProfile   = Join-Path $env:USERPROFILE '.dsh\profiles\web\node_modules\dsh-vk-layout\lib\client.js'

function Get-ShellFile {
  if (-not (Test-Path $HtmlFile)) { throw ('Missing ' + $HtmlFile) }
  $html = [IO.File]::ReadAllText($HtmlFile, [Text.Encoding]::UTF8)
  $m = [regex]::Match($html, 'assets/(index-[A-Za-z0-9_\-]+\.js)')
  if (-not $m.Success) { throw 'Cannot resolve shell bundle from dist/index.html' }
  $p = Join-Path (Join-Path $DistDir 'assets') $m.Groups[1].Value
  if (-not (Test-Path $p)) { throw ('Shell bundle missing: ' + $p) }
  return $p
}
$ShellFile = Get-ShellFile

function Get-BraceEnd([string]$text, [int]$start) {
  $depth = 0
  for ($i = $start; $i -lt $text.Length; $i++) {
    $ch = $text[$i]
    if ($ch -eq '{') { $depth++ }
    elseif ($ch -eq '}') { $depth--; if ($depth -eq 0) { return $i } }
  }
  throw 'Unbalanced braces while locating function end.'
}

function Assert-Count([string]$text, [string]$anchor, [int]$want, [string]$name) {
  $n = [regex]::Matches($text, [regex]::Escape($anchor)).Count
  if ($n -ne $want) { throw ('Anchor [' + $name + '] expected ' + $want + ' got ' + $n) }
}

$NewNS = @'
function NS(e){const{state:n,callbacks:o,preview:s}=e,a=j.useRef(),u={...o,onFocusTab:x=>{a.current=Kt(n,x).activeTabId===x?void 0:{tabId:x,origin:document.activeElement},o.onFocusTab(x)}},m=S7(n,e.intents),TR=z=>z.map(v=>`minmax(0, ${v}fr)`).join(" 0px "),KI=(pane,cell)=>{const out=[];for(const id of pane.tabs){const tab=n.tabs[id];if(tab!==void 0)out.push(l.jsx(TS,{...e,callbacks:u,tab:tab,pane:pane,column:cell.idx,cell:cell,floats:m,focusRequest:a},id))}if(out.length===0)out.push(l.jsx("div",{className:xe.emptyTabHost,"data-dockkit-empty":!0,style:{gridColumn:cell.col,gridRow:cell.row},children:l.jsx(b7,{state:n,pane:pane,callbacks:o})},pane.id));return out},DIV=(node,i,row)=>l.jsx("div",{className:row?he(xe.divider,xe.tabLayoutDivider):xe.divider,"data-dockkit-divider":`${node.id}:${i}`,style:row?{gridColumn:(i+1)*2,gridRow:1}:{gridColumn:1,gridRow:(i+1)*2,zIndex:"calc(var(--dsh-dockkit-dock-layer, 10) + 1)",pointerEvents:"auto"},onPointerDown:ev=>{o.onDividerPressed(node.id,i,ev)}},`${node.id}:${i}`),SP=node=>{const sizes=s!==void 0&&s.splitId===node.id?s.sizes:node.sizes,row=node.axis==="row",items=[];node.children.forEach((childId,i)=>{if(i>0)items.push(DIV(node,i-1,row));const child=_n(n,childId),t=i*2+1;if(child.kind==="pane"){const cell=row?{col:t,row:1,idx:i}:{col:1,row:t,idx:i};for(const it of KI(child,cell))items.push(it)}else{const sub=SP(child),cc=row?{col:t,row:1}:{col:1,row:t};items.push(l.jsx("div",{className:sub.row?xe.tabLayout:he(xe.tabLayout,xe.splitColumn),"data-dockkit-split":child.id,style:sub.row?{gridColumn:cc.col,gridRow:cc.row,gridTemplateColumns:TR(sub.sizes)}:{gridColumn:cc.col,gridRow:cc.row,gridTemplateColumns:"minmax(0, 1fr)",gridTemplateRows:TR(sub.sizes)},children:sub.items},child.id))}});return{sizes:sizes,row:row,items:items}},root=_n(n,n.rootId),fl=[];for(const fid of n.floats??[]){const pane=Pe(n,fid);if(pane===void 0)continue;for(const id of pane.tabs){const tab=n.tabs[id];if(tab!==void 0)fl.push(l.jsx(TS,{...e,callbacks:u,tab:tab,pane:pane,column:0,floats:m,focusRequest:a},id))}}if(root.kind==="pane")return l.jsxs("div",{className:xe.tabLayout,style:{gridTemplateColumns:"minmax(0, 1fr)"},children:[...KI(root,{col:1,row:1,idx:0}),...fl]});const parts=SP(root);return l.jsxs("div",{className:parts.row?xe.tabLayout:he(xe.tabLayout,xe.splitColumn),"data-dockkit-split":root.id,style:parts.row?{gridTemplateColumns:TR(parts.sizes)}:{gridTemplateColumns:"minmax(0, 1fr)",gridTemplateRows:TR(parts.sizes)},children:[...parts.items,...fl]})}
'@

if ($Revert) {
  $latest = Get-ChildItem $BkRoot -Directory -Filter 'dsh-dockkit-2axis-*' -ErrorAction SilentlyContinue |
            Sort-Object Name | Select-Object -Last 1
  if ($null -eq $latest) { throw 'No backup directory dsh-dockkit-2axis-* found.' }
  Copy-Item (Join-Path $latest.FullName 'sidebar-right.client.js') $SidebarFile -Force
  Copy-Item (Join-Path $latest.FullName 'shell-index.js')         $ShellFile   -Force
  Copy-Item (Join-Path $latest.FullName 'vk-layout.client.js')    $VkSrc       -Force
  Copy-Item $VkSrc $VkProfile -Force
  Write-Output ('REVERTED from ' + $latest.Name)
  exit 0
}

$shellText   = [IO.File]::ReadAllText($ShellFile,   [Text.Encoding]::UTF8)
$sidebarText = [IO.File]::ReadAllText($SidebarFile, [Text.Encoding]::UTF8)
$vkText      = [IO.File]::ReadAllText($VkSrc,       [Text.Encoding]::UTF8)

$nsAnchor = 'function NS(e){'
Assert-Count $shellText $nsAnchor 1 'NS'
$nsStart = $shellText.IndexOf($nsAnchor)
$nsEnd   = Get-BraceEnd $shellText $nsStart
$nsOld   = $shellText.Substring($nsStart, $nsEnd - $nsStart + 1)
if (-not $nsOld.Contains('DockLayout requires one pane or two horizontally split panes')) { throw 'NS body sanity check failed.' }

$TsParamsOld = 'function TS({state:e,callbacks:n,intents:o,tab:s,pane:a,column:u,floats:f,focusRequest:h,keepMounted:g,active:m=!0}){'
$TsParamsNew = 'function TS({state:e,callbacks:n,intents:o,tab:s,pane:a,column:u,cell:dkCell,floats:f,focusRequest:h,keepMounted:g,active:m=!0}){'
$TsStyleOld  = 'style:{gridColumn:w?1:u*2+1,gridRow:1,order:w?H:0}'
$TsStyleNew  = 'style:{gridColumn:w?1:dkCell?dkCell.col:u*2+1,gridRow:w?1:dkCell?dkCell.row:1,order:w?H:0}'
$CapOld      = 'function ks(e){return G8(e)<4}'
$CapNew      = 'function ks(e){return G8(e)<' + $Cap + '}'
$MaxOld      = 'const rS=4,Y0=.12'
$MaxNew      = 'const rS=' + $Cap + ',Y0=.12'

Assert-Count $shellText $TsParamsOld 1 'ts-params'
Assert-Count $shellText $TsStyleOld  1 'ts-style'
Assert-Count $shellText $CapOld      1 'canSplit'
Assert-Count $shellText $MaxOld      1 'maxPanes'

$SbRules = @(
  @{ n='dropZones';       a='dropZones: "horizontal",';                                     b='dropZones: "edges",' },
  @{ n='zone-guard';      a='if (zone === "top" || zone === "bottom") return [];';           b='' },
  @{ n='dropTab-budget';  a='dockPaneIds)(state).length >= 2) return [];';                    b=('dockPaneIds)(state).length >= ' + $Cap + ') return [];') },
  @{ n='splitPane-guard'; a='dockPaneIds)(state).length >= 2 ||';                             b=('dockPaneIds)(state).length >= ' + $Cap + ' ||') },
  @{ n='canSplit-prop';   a='dockPaneIds)(surface.layout).length < 2,';                       b=('dockPaneIds)(surface.layout).length < ' + $Cap + ',') },
  @{ n='preferNewPane';   a='dockPaneIds)(surface.layout).length < 2 &&';                     b=('dockPaneIds)(surface.layout).length < ' + $Cap + ' &&') },
  @{ n='budget-reason';   a='dockPaneIds)(layout).length >= 2) return "budget";';             b=('dockPaneIds)(layout).length >= ' + $Cap + ') return "budget";') },
  @{ n='split-command';   a='dockPaneIds)(layout).length >= 2 ||';                            b=('dockPaneIds)(layout).length >= ' + $Cap + ' ||') },
  @{ n='persist-validate';a='if (host !== "dock" || id !== layout.rootId || entry.axis !== "row" || entry.children.length !== 2 || entry.children.length !== entry.sizes.length'; b='if (host !== "dock" || entry.children.length !== entry.sizes.length' }
)
foreach ($r in $SbRules) { Assert-Count $sidebarText $r.a 1 $r.n }

$sbLines = $sidebarText -split "`n"
$pnIdx = -1
for ($i = 0; $i -lt $sbLines.Count; $i++) {
  if ($sbLines[$i].Trim() -eq '}) : [];') {
    if ($pnIdx -ge 0) { throw 'preferNewPane line is not unique.' }
    $pnIdx = $i
  }
}
if ($pnIdx -lt 0) { throw 'preferNewPane line not found.' }
$pnOld = $sbLines[$pnIdx]
Assert-Count $sidebarText ("`n" + $pnOld) 1 'preferNewPane-line'
$pnIndent = $pnOld.Substring(0, $pnOld.Length - $pnOld.TrimStart().Length)
$pnNew    = '}).map((op) => op.type === "split" ? Object.assign({}, op, { axis: "column" }) : op) : [];'

$VkOpenBtn  = 'try { const sr = ctxRef.current === null || ctxRef.current === void 0 ? void 0 : ctxRef.current.get("sidebarRight"); if (sr !== null && sr !== void 0 && typeof sr.openTab === "function") sr.openTab("terminal", { preferNewPane: true }); } catch {}'
$VkOpenDown = 'try { const srDown = ctx.get("sidebarRight"); if (srDown !== null && srDown !== void 0 && typeof srDown.openTab === "function") srDown.openTab("terminal", { preferNewPane: true }); } catch {}'
$VkMountOld = 'unmountMount = vkCmdMount(host);'
$VkMountNew = 'unmountMount = () => {};'
$VkKeyOld   = 'code: "Digit4", kind: null,'
$VkKeyNew   = 'code: "Digit4", kind: "terminal",'

Assert-Count $vkText $VkMountOld 1 'vk-mount'
Assert-Count $vkText $VkKeyOld   1 'vk-shortcut'
$vLines = $vkText -split "`n"
if ($vLines[1851].Trim() -ne 'vkCmdStore.setOpen(vkCmdStore.open !== true);') { throw 'vk line 1852 content mismatch.' }
if ($vLines[2331].Trim() -ne 'vkCmdStore.setOpen(true);') { throw 'vk line 2332 content mismatch.' }
$vkIndBtn  = $vLines[1851].Substring(0, $vLines[1851].Length - $vLines[1851].TrimStart().Length)
$vkIndDown = $vLines[2331].Substring(0, $vLines[2331].Length - $vLines[2331].TrimStart().Length)

Write-Output 'ANCHORS OK (shell 6, sidebar 10, vk 5)'
Write-Output ('SHELL   -> ' + $ShellFile)
Write-Output ('SIDEBAR -> ' + $SidebarFile)
Write-Output ('VK      -> ' + $VkSrc)
Write-Output ('VKPROF  -> ' + $VkProfile)
if ($DryRun) { Write-Output 'DRY RUN - nothing written.'; exit 0 }

$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$dir   = Join-Path $BkRoot ('dsh-dockkit-2axis-' + $stamp)
New-Item -ItemType Directory -Force -Path $dir    | Out-Null
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null
Copy-Item $ShellFile   (Join-Path $dir 'shell-index.js')          -Force
Copy-Item $SidebarFile (Join-Path $dir 'sidebar-right.client.js') -Force
Copy-Item $VkSrc       (Join-Path $dir 'vk-layout.client.js')     -Force

$newShell = $shellText.Substring(0, $nsStart) + $NewNS + $shellText.Substring($nsEnd + 1)
$newShell = $newShell.Replace($TsParamsOld, $TsParamsNew)
$newShell = $newShell.Replace($TsStyleOld,  $TsStyleNew)
$newShell = $newShell.Replace($CapOld,      $CapNew)
$newShell = $newShell.Replace($MaxOld,      $MaxNew)

$newSidebar = $sidebarText
foreach ($r in $SbRules) { $newSidebar = $newSidebar.Replace($r.a, $r.b) }
$sbLines2 = $newSidebar -split "`n"
if ($sbLines2[$pnIdx].Trim() -ne '}) : [];') { throw 'preferNewPane line shifted.' }
$sbLines2[$pnIdx] = $pnIndent + $pnNew
$newSidebar = $sbLines2 -join "`n"

$newVk = $vkText.Replace($VkMountOld, $VkMountNew).Replace($VkKeyOld, $VkKeyNew)
$vLines2 = $newVk -split "`n"
$vLines2[1851] = $vkIndBtn  + $VkOpenBtn
$vLines2[2331] = $vkIndDown + $VkOpenDown
$newVk = $vLines2 -join "`n"

if ($newShell.Contains($nsAnchor) -and -not $newShell.Contains('data-dockkit-divider":`${node.id}:${i}`')) { throw 'NS replacement did not apply.' }
if (-not $newShell.Contains('function ks(e){return G8(e)<' + $Cap + '}')) { throw 'canSplit patch missing.' }
if ($newShell.Contains('DockLayout requires one pane or two horizontally split panes')) { throw 'DockLayout guard still present.' }
if (-not $newShell.Contains('cell:dkCell,')) { throw 'TabHost cell prop missing.' }
if (-not $newShell.Contains('dkCell?dkCell.col')) { throw 'TabHost placement patch missing.' }
if ($newSidebar.Contains('dropZones: "horizontal",')) { throw 'dropZones not patched.' }
if (-not $newSidebar.Contains('axis: "column"')) { throw 'preferNewPane axis not patched.' }
if ($newSidebar.Contains('id !== layout.rootId')) { throw 'validator not relaxed.' }
if (-not $newVk.Contains('openTab("terminal"')) { throw 'vk openTab patch missing.' }
if (-not $newVk.Contains('kind: "terminal",')) { throw 'vk shortcut patch missing.' }

[IO.File]::WriteAllText($ShellFile,   $newShell,   $Utf8)
[IO.File]::WriteAllText($SidebarFile, $newSidebar, $Utf8)
[IO.File]::WriteAllText($VkSrc,       $newVk,      $Utf8)
Copy-Item $VkSrc $VkProfile -Force

$h1 = (Get-FileHash $VkSrc).Hash
$h2 = (Get-FileHash $VkProfile).Hash
if ($h1 -ne $h2) { throw 'Profile copy mismatch after sync.' }

foreach ($pair in @(
  @{ t='shell';   p=$ShellFile },
  @{ t='sidebar'; p=$SidebarFile },
  @{ t='vk';      p=$VkSrc }
)) {
  $tmp = Join-Path $TmpDir ('chk-' + $pair.t + '.mjs')
  [IO.File]::WriteAllText($tmp, [IO.File]::ReadAllText($pair.p, [Text.Encoding]::UTF8), $Utf8)
  & node --check $tmp 2>&1 | Out-Null
  $code = $LASTEXITCODE
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw ('SYNTAX CHECK FAILED for ' + $pair.t + ' - run with -Revert') }
  Write-Output ('SYNTAX OK  ' + $pair.t)
}

Write-Output 'PATCHED 3 files (vk profile synced)'
Write-Output ('BACKUP  -> ' + $dir)
