import { headingStylesXml, numberingXml } from '../styleDefs'

describe('DOCX styleDefs: font default', () => {
  it("a blank new document's Normal style carries no explicit font or size (implicit application default, see specs/neues-dokument-code.md 3.5)", () => {
    const xml = headingStylesXml()
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)

    // <w:docDefaults/> stays empty — no product-wide font/size standard is enforced.
    expect(xml).toMatch(/<w:docDefaults\s*\/>/)

    const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const normalStyle = Array.from(doc.getElementsByTagNameNS(w, 'style')).find(
      (el) => el.getAttributeNS(w, 'styleId') === 'Normal',
    )
    expect(normalStyle).toBeDefined()
    expect(normalStyle!.getElementsByTagNameNS(w, 'rFonts')).toHaveLength(0)
    expect(normalStyle!.getElementsByTagNameNS(w, 'sz')).toHaveLength(0)
  })
})

describe('DOCX styleDefs: Nummerierungsdefinitionen (liste-einruecken-tab-req.md Befund C)', () => {
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

  function parsedNumbering(): Document {
    const doc = new DOMParser().parseFromString(numberingXml(), 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    return doc
  }

  it('nummerierte Ebenen referenzieren ihren EIGENEN Zähler (%N-Fehlreferenz behoben)', () => {
    const doc = parsedNumbering()
    const orderedAbstract = Array.from(doc.getElementsByTagNameNS(w, 'abstractNum')).find(
      (el) => el.getAttributeNS(w, 'abstractNumId') === '1',
    )!
    const lvls = Array.from(orderedAbstract.getElementsByTagNameNS(w, 'lvl'))
    expect(lvls).toHaveLength(9)
    for (const lvl of lvls) {
      const ilvl = Number(lvl.getAttributeNS(w, 'ilvl'))
      const lvlText = lvl.getElementsByTagNameNS(w, 'lvlText')[0].getAttributeNS(w, 'val')
      expect(lvlText, `ilvl ${ilvl} muss den eigenen Zähler zeigen`).toBe(`%${ilvl + 1}.`)
      expect(lvl.getElementsByTagNameNS(w, 'start')[0].getAttributeNS(w, 'val')).toBe('1')
    }
  })

  it('jede Ebene (Bullet und Nummeriert) trägt den Word-üblichen Einzug (720 Twips/Ebene, 360 hängend)', () => {
    const doc = parsedNumbering()
    for (const abstractEl of Array.from(doc.getElementsByTagNameNS(w, 'abstractNum'))) {
      for (const lvl of Array.from(abstractEl.getElementsByTagNameNS(w, 'lvl'))) {
        const ilvl = Number(lvl.getAttributeNS(w, 'ilvl'))
        const ind = lvl.getElementsByTagNameNS(w, 'ind')[0]
        expect(ind, `ilvl ${ilvl} braucht w:ind`).toBeDefined()
        expect(ind.getAttributeNS(w, 'left')).toBe(String(720 * (ilvl + 1)))
        expect(ind.getAttributeNS(w, 'hanging')).toBe('360')
      }
    }
  })
})
