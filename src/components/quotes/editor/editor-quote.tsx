'use client'

import { Content } from '@/components/app-shell/header'
import { SheetForm } from '@/components/form/structure-form'
import { SaveTemplate } from '@/components/quotes/specials/save-template'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { NEW_CONTEXT } from '@/lib/quotes/context-status'
import { ActionsHeader } from './actions-editor'
import { BandsEditor } from './bands-editor'
import { BarBottom } from './bar-bottom'
import { CardClient } from './card-client'
import { CardData } from './card-data'
import { CardItems } from './card-items'
import { CardSubject } from './card-subject'
import { CardTexts } from './card-texts'
import { HeaderEditor } from './header-editor'
import { MobilePreviewButton, ColumnViewPreview, PreviewSidebar } from './panel-preview'

import type { QuoteEditorProps } from './quote-editor.types'
import { useQuoteEditor } from './use-quote-editor'
export type { SavedQuote as VersionGuardada } from './quote-actions.types'

export function EditorQuote(props: QuoteEditorProps) {
  const { today, context = NEW_CONTEXT } = props
  const {
    state,
    catalogs,
    contacts,
    errors,
    errorsItems,
    errorsBlocks,
    warning,
    unassignedErrors,
    changes,
    withoutSave,
    pendingList,
    editable,
    preparingPurchaseOrder,
    action,
    busy,
    actions,
    view,
    lineView,
    root,
    save,
    applySectionDrafts,
    validateForPreview,
    saveForPreview,
    dispatch,
    setContacts,
    setCatalogsBase,
    onChangeDraftSection,
    preparePurchaseOrder,
  } = useQuoteEditor(props)
  return (
    <div ref={root}>
      <Content className="pb-28 min-[90rem]:pb-8">
        <HeaderEditor
          state={state}
          today={today}
          editable={editable}
          changes={withoutSave}
          saving={action === 'guardar'}
          busy={busy}
          onSave={() => void save()}
          actions={
            <>
              <SaveTemplate state={state} disabled={busy} beforeOpen={applySectionDrafts} />
              <ActionsHeader state={state} context={context} pendingList={pendingList} actions={actions} />
            </>
          }
        />
        <BandsEditor
          state={state}
          context={context}
          pendingList={pendingList}
          actions={actions}
          hasChangesWithoutSave={changes}
          today={today}
        />
        {state.id && state.estado === 'enviada' ? (
          <div className="mb-4">
            <Button type="button" variant="outline" disabled={busy} onClick={preparePurchaseOrder}>
              Aprobar y cargar orden de compra
            </Button>
          </div>
        ) : null}
        {warning ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{warning}</p>
              {unassignedErrors.length ? (
                <ul className="list-disc pl-5">
                  {unassignedErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid items-start gap-5 min-[90rem]:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
          {/* Aprobada o rechazada: todo de solo lectura, pero legible (sin la opacidad de :disabled). Mientras corre
              una transición, también: no se tipea sobre algo que se está enviando, aprobando o rechazando. */}
          <fieldset
            disabled={!editable || actions.transitioning || preparingPurchaseOrder}
            className="min-w-0 [&_:disabled]:opacity-100! [&_[data-slot=native-select-wrapper]]:opacity-100!"
          >
            <legend className="sr-only">Contenido de la cotización</legend>
            <SheetForm>
              <CardClient
                state={state}
                contacts={contacts}
                errors={errors}
                dispatch={dispatch}
                onChangeContacts={setContacts}
                onChangeCatalogs={setCatalogsBase}
              />
              <CardData
                state={state}
                catalogs={catalogs}
                pendingList={pendingList}
                errors={errors}
                dispatch={dispatch}
              />
              <CardSubject state={state} errors={errors} dispatch={dispatch} />
              <CardItems
                items={state.items}
                format={state.formato}
                showTotal={state.mostrarTotal}
                errors={errorsItems}
                dispatch={dispatch}
                onChangeDraftSection={onChangeDraftSection}
              />
              <CardTexts
                blocks={state.bloques}
                template={catalogs.plantillas.find((template) => template.id === state.templateId) ?? null}
                errors={errorsBlocks}
                dispatch={dispatch}
              />
            </SheetForm>
          </fieldset>
          <ColumnViewPreview view={view} line={lineView} />
        </div>
      </Content>
      <BarBottom
        editable={editable}
        isNew={state.id === null}
        changes={withoutSave}
        guardando={action === 'guardar'}
        busy={busy}
        onSave={() => void save()}
        viewPreview={
          <>
            <PreviewSidebar view={view} line={lineView} />
            <MobilePreviewButton mode={view.mode} busy={busy} validate={validateForPreview} saveForPreview={saveForPreview} />
          </>
        }
      />
    </div>
  )
}
