import * as fs     from 'fs'
import * as path   from 'path'
import * as vscode from 'vscode'

import { registerCommand, Command, CommandFlags, CommandState, InputKind } from '.'
import { EditorState } from '../state/editor'
import { SelectionBehavior } from '../state/extension'
import { ExtendBehavior, Extend, DoNotExtend, SelectionHelper, jumpTo, CoordMapper } from '../utils/selectionHelper'


const getMenu = (name: string) => (editorState: EditorState) => {
  const menuItems = editorState.extension.menus.get(name)!.items

  return Object.entries(menuItems).map(x => [x[0], x[1].text]) as [string, string][]
}

const executeMenuItem = async (editorState: EditorState, name: string, i: number) => {
  const menuItems = editorState.extension.menus.get(name)!.items
  const menuItem = Object.values(menuItems)[i]

  try {
    await vscode.commands.executeCommand(menuItem.command, menuItem.args)
  } catch (e) {
    const str = `${e}`.replace(/^Error: /, '')

    vscode.window.showErrorMessage(`Command did not succeed successfully: ${str}.`)
  }
}

// TODO: Make just merely opening the menu not count as a command execution
// and do not record it. The count+goto version (e.g. `10g`) should still count.
registerCommand(Command.goto, CommandFlags.ChangeSelections, InputKind.ListOneItemOrCount, getMenu('goto'), (editorState, state) => {
  if (state.input === null) {
    const { editor } = editorState,
          { document } = editor
    let line = state.currentCount - 1

    if (line >= document.lineCount)
      line = document.lineCount - 1

    const active = new vscode.Position(line, 0),
          anchor = new vscode.Position(line, 0)

    editor.selections = [new vscode.Selection(anchor, active)]

    return
  } else {
    return executeMenuItem(editorState, 'goto', state.input)
  }
})

// TODO: Make just merely opening the menu not count as a command execution
// and do not record it. The count+goto version (e.g. `10G`) should still count.
registerCommand(Command.gotoExtend, CommandFlags.ChangeSelections, InputKind.ListOneItemOrCount, getMenu('goto.extend'), (editorState, state) => {
  if (state.input === null) {
    const { editor } = editorState,
          { document, selection } = editor
    let line = state.currentCount - 1

    if (line >= document.lineCount)
      line = document.lineCount - 1

    const anchor = selection.anchor,
          active = new vscode.Position(line, 0)

    editor.selections = [new vscode.Selection(anchor, active)]

    return
  } else {
    return executeMenuItem(editorState, 'goto.extend', state.input)
  }
})

const toStartCharacterFunc: CoordMapper = (from, { editorState }, i) => {
  editorState.preferredColumns[i] = 0

  return from.with(undefined, 0)
}
const toFirstNonBlankCharacterFunc: CoordMapper = (from, { editor, editorState }, i) => {
  const column = editor.document.lineAt(from).firstNonWhitespaceCharacterIndex

  editorState.preferredColumns[i] = column

  return from.with(undefined, column)
}
const toEndCharacterFunc: CoordMapper = (from, helper, i) => {
  const lineLen = helper.editor.document.lineAt(from).text.length

  helper.editorState.preferredColumns[i] = Number.MAX_SAFE_INTEGER

  if (lineLen === 0 || helper.selectionBehavior === SelectionBehavior.Caret)
    return from.with(undefined, lineLen)
  else
    return from.with(undefined, lineLen - 1)
}

function toCharacter(func: CoordMapper, extend: ExtendBehavior) {
  const mapper = jumpTo(func, extend)
  // TODO: Should also reveal selection active(s) after moving.
  return (editorState: EditorState, commandState: CommandState) =>
    SelectionHelper.for(editorState, commandState).mapEach(mapper)
}

registerCommand(Command.gotoLineStart              , CommandFlags.ChangeSelections, toCharacter(toStartCharacterFunc        , DoNotExtend))
registerCommand(Command.gotoLineStartExtend        , CommandFlags.ChangeSelections, toCharacter(toStartCharacterFunc        ,      Extend))
registerCommand(Command.gotoLineStartNonBlank      , CommandFlags.ChangeSelections, toCharacter(toFirstNonBlankCharacterFunc, DoNotExtend))
registerCommand(Command.gotoLineStartNonBlankExtend, CommandFlags.ChangeSelections, toCharacter(toFirstNonBlankCharacterFunc,      Extend))
registerCommand(Command.gotoLineEnd                , CommandFlags.ChangeSelections, toCharacter(toEndCharacterFunc          , DoNotExtend))
registerCommand(Command.gotoLineEndExtend          , CommandFlags.ChangeSelections, toCharacter(toEndCharacterFunc          ,      Extend))

const toFirstVisibleLineFunc: CoordMapper = (from, { editor }) =>
    from.with(editor.visibleRanges[0].start.line, 0)

const toLastVisibleLineFunc: CoordMapper = (from, { editor }) =>
    from.with(editor.visibleRanges[0].end.line, 0)

const toMiddleVisibleLineFunc: CoordMapper = (from, { editor }) =>
    from.with(((editor.visibleRanges[0].end.line + editor.visibleRanges[0].start.line) / 2) | 0, 0)

registerCommand(Command.gotoFirstVisibleLine       , CommandFlags.ChangeSelections, toCharacter( toFirstVisibleLineFunc, DoNotExtend))
registerCommand(Command.gotoFirstVisibleLineExtend , CommandFlags.ChangeSelections, toCharacter( toFirstVisibleLineFunc,      Extend))
registerCommand(Command.gotoMiddleVisibleLine      , CommandFlags.ChangeSelections, toCharacter(toMiddleVisibleLineFunc, DoNotExtend))
registerCommand(Command.gotoMiddleVisibleLineExtend, CommandFlags.ChangeSelections, toCharacter(toMiddleVisibleLineFunc,      Extend))
registerCommand(Command.gotoLastVisibleLine        , CommandFlags.ChangeSelections, toCharacter(  toLastVisibleLineFunc, DoNotExtend))
registerCommand(Command.gotoLastVisibleLineExtend  , CommandFlags.ChangeSelections, toCharacter(  toLastVisibleLineFunc,      Extend))

const toFirstLineFunc: CoordMapper = () => new vscode.Position(0, 0)

const toLastLineStartFunc: CoordMapper = (_, helper) => {
  const document = helper.editor.document
  let line = document.lineCount - 1

  // In case of trailing line break, go to the second last line.
  if (line > 0 && document.lineAt(document.lineCount - 1).text.length === 0)
    line--

  return new vscode.Position(line, 0)
}

// TODO: Also need to set preferredColumn to max.
const toLastLineEndFunc: CoordMapper = (_, helper) => {
  const document = helper.editor.document
  const line = document.lineCount - 1
  const lineLen = document.lineAt(document.lineCount - 1).text.length
  return new vscode.Position(line, lineLen)
}

registerCommand(Command.gotoFirstLine      , CommandFlags.ChangeSelections, toCharacter(toFirstLineFunc, DoNotExtend))
registerCommand(Command.gotoFirstLineExtend, CommandFlags.ChangeSelections, toCharacter(toFirstLineFunc,      Extend))

registerCommand(Command.gotoLastLine           , CommandFlags.ChangeSelections, toCharacter(toLastLineStartFunc, DoNotExtend))
registerCommand(Command.gotoLastLineExtend     , CommandFlags.ChangeSelections, toCharacter(toLastLineStartFunc,      Extend))
registerCommand(Command.gotoLastCharacter      , CommandFlags.ChangeSelections, toCharacter(toLastLineEndFunc  , DoNotExtend))
registerCommand(Command.gotoLastCharacterExtend, CommandFlags.ChangeSelections, toCharacter(toLastLineEndFunc  ,      Extend))

registerCommand(Command.gotoSelectedFile, CommandFlags.ChangeSelections, ({ editor }) => {
  const basePath = path.dirname(editor.document.fileName)

  return new Promise<void>(resolve => fs.exists(basePath, exists => {
    if (!exists)
      return

    const selections = editor.selections
    let remaining = selections.length

    for (const selection of selections) {
      const filename = editor.document.getText(selection)
      const filepath = path.resolve(basePath, filename)

      fs.exists(filepath, exists => {
        if (exists) {
          vscode.workspace.openTextDocument(filepath)
            .then(vscode.window.showTextDocument)
        } else {
          vscode.window.showErrorMessage(`File ${filepath} does not exist.`)
        }

        if (--remaining === 0)
          resolve()
      })
    }
  }))
})

function toLastBufferModification(editorState: EditorState, extend: ExtendBehavior) {
  const { documentState, editor } = editorState

  if (documentState.recordedChanges.length > 0) {
    const range = documentState.recordedChanges[documentState.recordedChanges.length - 1].range,
          selection = range.selection(documentState.document)

    editor.selection = extend ? new vscode.Selection(editor.selection.anchor, selection.active) : selection
  }
}

registerCommand(Command.gotoLastModification      , CommandFlags.ChangeSelections, (editorState) => toLastBufferModification(editorState, DoNotExtend))
registerCommand(Command.gotoLastModificationExtend, CommandFlags.ChangeSelections, (editorState) => toLastBufferModification(editorState,      Extend))
