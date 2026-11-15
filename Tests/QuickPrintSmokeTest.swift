import Foundation

@main
struct QuickPrintSmokeTest {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("LabelDesk-test-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: root) }
        let storage = StorageService(rootURL: root)

        let id = UUID()
        var base = LabelDocument()
        base.name = "Original"
        base.widthMM = 40
        base.heightMM = 30

        var dynamic = LabelElement.text()
        dynamic.id = id
        dynamic.value = "Original variable value"
        dynamic.fieldName = "Название товара"
        dynamic.isVariable = true

        var constant = LabelElement.text()
        constant.value = "НЕ МЕНЯТЬ"
        constant.isVariable = false
        constant.yMM = 15

        let barcode = LabelElement.barcode()
        base.elements = [dynamic, constant, barcode]

        let fields = QuickLabelBuilder.fields(for: base)
        assert(fields.count == 1)
        assert(fields[0].id == dynamic.id)
        assert(fields[0].title == "Название товара")

        let changed = QuickLabelBuilder.filled(
            base: base, values: [dynamic.id: "Новый товар", constant.id: "НЕ ДОЛЖНО МЕНЯТЬСЯ"]
        )
        assert(changed.elements[0].value == "Новый товар")
        assert(changed.elements[1].value == "НЕ МЕНЯТЬ")
        assert(changed.elements[2] == barcode)
        assert(changed.elements[0].xMM == base.elements[0].xMM)
        assert(changed.elements[0].widthMM == base.elements[0].widthMM)
        assert(base.elements[0].value == "Original variable value",
               "Quick-fill must never mutate the original base template")

        // The old v0.6 JSON lacks folderID, fieldName and isVariable.
        var legacy = try JSONSerialization.jsonObject(with: JSONEncoder().encode(base)) as! [String: Any]
        legacy.removeValue(forKey: "folderID")
        var oldElements = legacy["elements"] as! [[String: Any]]
        for index in oldElements.indices {
            oldElements[index].removeValue(forKey: "fieldName")
            oldElements[index].removeValue(forKey: "isVariable")
        }
        legacy["elements"] = oldElements
        let legacyData = try JSONSerialization.data(withJSONObject: legacy)
        let decoded = try JSONDecoder().decode(LabelDocument.self, from: legacyData)
        assert(decoded.folderID == nil)
        assert(QuickLabelBuilder.fields(for: decoded).count == 2,
               "Legacy text objects should remain available in quick mode")

        var folderBase = base
        folderBase.id = UUID()
        let folder = LabelFolder(name: "Товары", baseTemplateID: folderBase.id)
        folderBase.folderID = folder.id
        try storage.saveFolders([folder])
        try storage.saveDocument(folderBase)
        let savedFolders = storage.loadFolders()
        assert(savedFolders.count == 1 && savedFolders[0].id == folder.id &&
               savedFolders[0].baseTemplateID == folderBase.id)
        let loaded = storage.listDocuments()
        assert(loaded.count == 1 && loaded[0].id == folderBase.id &&
               loaded[0].folderID == folder.id && loaded[0].elements == folderBase.elements)
        let quick = QuickLabelBuilder.filled(base: loaded[0], values: [id: "Молоко"])
        assert(quick.elements[0].value == "Молоко")

        let reopened = StorageService(rootURL: root)
        assert(reopened.loadFolders().first?.baseTemplateID == folderBase.id)
        assert(reopened.listDocuments().count == 1)

        try reopened.deleteDocument(folderBase.id)
        assert(reopened.listDocuments().isEmpty)
        assert(reopened.loadFolders().count == 1,
               "Folder metadata should not be silently removed when template is deleted")
        print("Folder and quick-print smoke tests passed.")
    }
}
