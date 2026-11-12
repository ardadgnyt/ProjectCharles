'use strict';
// v0.9.26: PowerPoint files written by Charles (PDF → PPTX):
//   pictureSlides: each page becomes a slide that is the page's picture (looks exactly like it).
//   textSlides:    each page becomes a slide of text boxes where the text stood (editable; the
//                  page's pictures, lines and colours are not carried).
const { zipSync, strToU8 } = require('fflate');
const { esc } = require('./sheets.cjs');

const EMU = 12700; // per point
const clampSize = (pt) => Math.max(914400, Math.min(51206400, Math.round(pt * EMU)));

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Charles"><a:themeElements><a:clrScheme name="Charles"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Charles"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Charles"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

function pack(slides, size) {
  const files = {};
  const n = slides.length;
  const media = [];
  slides.forEach((s, i) => {
    if (s.image) media.push({ slide: i, name: `image${i + 1}.${s.image.ext}`, data: s.image.data });
  });
  const exts = [...new Set(media.map((m) => m.name.split('.').pop()))];
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      exts.map((e) => `<Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e}"/>`).join('') +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') +
      '</Types>',
  );
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  files['ppt/presentation.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>` +
      slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('') +
      `</p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  files['ppt/_rels/presentation.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
      slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`,
  );
  files['ppt/theme/theme1.xml'] = strToU8(THEME);
  files['ppt/slideMasters/slideMaster1.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}><p:cSld><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  files['ppt/slideLayouts/slideLayout1.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="blank"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld></p:sldLayout>`);
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  slides.forEach((s, i) => {
    const m = media.find((x) => x.slide === i);
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree>${EMPTY_TREE}${s.shapes}</p:spTree></p:cSld></p:sld>`);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${m ? `<Relationship Id="rId2" Type="${REL}/image" Target="../media/${m.name}"/>` : ''}</Relationships>`,
    );
    if (m) files[`ppt/media/${m.name}`] = [new Uint8Array(m.data), { level: 0 }];
  });
  return Buffer.from(zipSync(files, { level: 6 }));
}

/** pages: [{ data: Buffer, ext: 'png'|'jpg', width, height }] (width/height in points). */
function pictureSlides(pages) {
  if (!pages.length) throw Error('Slayt yok.');
  const size = { cx: clampSize(pages[0].width), cy: clampSize(pages[0].height) };
  return pack(
    pages.map((p, i) => {
      // the picture fills the slide, keeping its proportions, centred
      const k = Math.min(size.cx / (p.width * EMU), size.cy / (p.height * EMU));
      const cx = Math.round(p.width * EMU * k), cy = Math.round(p.height * EMU * k);
      const x = Math.round((size.cx - cx) / 2), y = Math.round((size.cy - cy) / 2);
      return {
        image: { ext: p.ext, data: p.data },
        shapes: `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Sayfa ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
      };
    }),
    size,
  );
}

/** pages: [{ width, height, lines: [{ text, x, y, h }] }] in points → one text box per line. */
function textSlides(pages) {
  if (!pages.length) throw Error('Slayt yok.');
  const size = { cx: clampSize(pages[0].width), cy: clampSize(pages[0].height) };
  return pack(
    pages.map((p) => {
      const k = Math.min(size.cx / (p.width * EMU), size.cy / (p.height * EMU));
      const shapes = p.lines
        .filter((l) => l.text)
        .map((l, j) => {
          const pt = Math.max(6, Math.min(96, l.h * 0.9 * k));
          const x = Math.round(l.x * EMU * k), y = Math.round(l.y * EMU * k);
          const cx = Math.max(EMU * 20, Math.round((p.width - l.x) * EMU * k) - EMU * 4);
          const cy = Math.round(l.h * 1.35 * EMU * k);
          return `<p:sp><p:nvSpPr><p:cNvPr id="${j + 2}" name="Metin ${j + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="tr-TR" sz="${Math.round(pt * 100)}" dirty="0"/><a:t>${esc(l.text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
        })
        .join('');
      return { shapes };
    }),
    size,
  );
}

module.exports = { pictureSlides, textSlides };
