'use client'

import { Content } from '@/components/app-shell/header'
import { SheetForm } from '@/components/form/structure-form'
import { SaveTemplate } from '@/components/quotes/specials/save-template'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CONTEXTO_NEW } from '@/lib/quotes/context-status'
import { ActionsHeader } from './actions-editor'
import { BandsEditor } from './bands-editor'
import { BarBottom } from './bar-bottom'
import { CardClient } from './card-client'
import { CardData } from './card-data'
import { CardItems } from './card-items'
import { CardSubject } from './card-subject'
import { CardTexts } from './card-texts'
import { HeaderEditor } from './header-editor'
import { ButtonViewPreviewCelular, ColumnViewPreview, ViewPreviewLateral } from './panel-preview'

import type { QuoteEditorProps } from './quote-editor.types'
import { useQuoteEditor } from './use-quote-editor'
export type { QuoteGuardada as VersionGuardada } from './quote-actions.types'

export function EditorQuote(props: QuoteEditorProps) {
  const { today, contexto = CONTEXTO_NEW } = props
  const {
    estado,
    catalogs,
    contactos,
    errors,
    errorsItems,
    errorsBlocks,
    warning,
    sueltos,
    changes,
    withoutSave,
    pendingList,
    editable,
    preparandoOc,
    accion,
    busy,
    actions,
    view,
    lineView,
    raiz,
    save,
    applyBorradoresSection,
    validateForVer,
    saveForVer,
    despachar,
    setContacts,
    setCatalogsBase,
    onChangeDraftSection,
    preparePurchaseOrder,
  } = useQuoteEditor(props)
  return (
    <div ref={raiz}>
      <Content className="pb-28 min-[90rem]:pb-8">
        <HeaderEditor
          estado={estado}
          today={today}
          editable={editable}
          changes={withoutSave}
          guardando={accion === 'guardar'}
          busy={busy}
          onSave={() => void save()}
          actions={
            <>
              <SaveTemplate estado={estado} disabled={busy} antesOfAbrir={applyBorradoresSection} />
              <ActionsHeader estado={estado} contexto={contexto} pendingList={pendingList} actions={actions} />
            </>
          }
        />
        <BandsEditor
          estado={estado}
          contexto={contexto}
          pendingList={pendingList}
          actions={actions}
          hasChangesWithoutSave={changes}
          today={today}
        />
        {estado.id && estado.estado === 'enviada' ? (
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
              {sueltos.length ? (
                <ul className="list-disc pl-5">
                  {sueltos.map((message) => (
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
            disabled={!editable || actions.inTransicion || preparandoOc}
            className="min-w-0 [&_:disabled]:opacity-100! [&_[data-slot=native-select-wrapper]]:opacity-100!"
          >
            <legend className="sr-only">Contenido de la cotización</legend>
            <SheetForm>
              <CardClient
                estado={estado}
                contactos={contactos}
                errors={errors}
                despachar={despachar}
                onChangeContacts={setContacts}
                onChangeCatalogs={setCatalogsBase}
              />
              <CardData
                estado={estado}
                catalogs={catalogs}
                pendingList={pendingList}
                errors={errors}
                despachar={despachar}
              />
              <CardSubject estado={estado} errors={errors} despachar={despachar} />
              <CardItems
                items={estado.items}
                formato={estado.formato}
                mostrarTotal={estado.mostrarTotal}
                errors={errorsItems}
                despachar={despachar}
                onChangeDraftSection={onChangeDraftSection}
              />
              <CardTexts
                bloques={estado.bloques}
                plantilla={catalogs.plantillas.find((template) => template.id === estado.templateId) ?? null}
                errors={errorsBlocks}
                despachar={despachar}
              />
            </SheetForm>
          </fieldset>
          <ColumnViewPreview view={view} line={lineView} />
        </div>
      </Content>
      <BarBottom
        editable={editable}
        isNew={estado.id === null}
        changes={withoutSave}
        guardando={accion === 'guardar'}
        busy={busy}
        onSave={() => void save()}
        viewPreview={
          <>
            <ViewPreviewLateral view={view} line={lineView} />
            <ButtonViewPreviewCelular modo={view.modo} busy={busy} validate={validateForVer} saveForVer={saveForVer} />
          </>
        }
      />
    </div>
  )
}
