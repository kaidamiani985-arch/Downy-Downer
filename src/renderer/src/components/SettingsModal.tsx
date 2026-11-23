import { useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Terminal,
  Wrench
} from 'lucide-react'
import type { AppUpdateCheck, AppUpdateProgress, ToolsInfo, UpdateCheck } from '@shared/types'
import { formatTokenCount } from '@shared/youtube'
import { useAppStore } from '../store'
import {
  AUDIO_BITRATE_OPTIONS,
  AUDIO_FORMAT_OPTIONS,
  CONTAINER_OPTIONS,
  COOKIE_OPTIONS,
  QUALITY_OPTIONS
} from '../lib/options'
import { Modal, SelectField, Spinner, Toggle } from './ui'

export function SettingsModal() {
  const open = useAppStore((state) => state.settingsOpen)
  const close = useAppStore((state) => state.closeSettings)
  const snapshot = useAppStore((state) => state.snapshot)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const chooseFolder = useAppStore((state) => state.chooseFolder)
  const addToast = useAppStore((state) => state.addToast)

  const [tools, setTools] = useState<ToolsInfo | null>(null)
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolAction, setToolAction] = useState<'check' | 'update' | null>(null)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [appUpdate, setAppUpdate] = useState<AppUpdateCheck | null>(null)
  const [appChecking, setAppChecking] = useState(false)
  const [appInstalling, setAppInstalling] = useState(false)
  const [appProgress, setAppProgress] = useState<AppUpdateProgress | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setToolsLoading(true)
    window.downy
      .getTools()
      .then((result) => {
        if (active) setTools(result)
      })
      .catch(() => {
        if (active) setTools(null)
      })
      .finally(() => {
        if (active) setToolsLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    window.downy
      .checkAppUpdate(false)
      .then((result) => {
        if (active) setAppUpdate(result)
      })
      .catch(() => undefined)

    const unsubscribe = window.downy.onAppUpdateProgress((progress) => {
      if (active) setAppProgress(progress)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [open])

  if (!open || !snapshot) return null
  const settings = snapshot.settings

  const refreshTools = async () => {
    try {
      setTools(await window.downy.getTools())
    } catch {
      setTools(null)
    }
  }

  const checkUpdate = async () => {
    setToolAction('check')
    setUpdateMessage(null)
    try {
      const result: UpdateCheck = await window.downy.checkYtdlpUpdate()
      setUpdateMessage(result.message ?? (result.ok ? 'Checked.' : 'Could not check for updates.'))
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Could not check for updates.')
    } finally {
      setToolAction(null)
    }
  }

  const updateYtdlp = async () => {
    setToolAction('update')
    setUpdateMessage(null)
    try {
      const result = await window.downy.updateYtdlp()
      setUpdateMessage(result.message ?? (result.ok ? 'yt-dlp is updated.' : 'Update failed.'))
      await refreshTools()
      addToast(result.ok ? 'success' : 'error', result.ok ? 'yt-dlp is up to date.' : result.message ?? 'Update failed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed.'
      setUpdateMessage(message)
      addToast('error', message)
    } finally {
      setToolAction(null)
    }
  }


  const resetSave = async () => {
    setResetting(true)
    try {
      const result = await window.downy.resetSave()
      if (result.ok) {
        addToast('success', 'Save reset. You have 0 tokens.')
      } else if (!result.canceled && result.message) {
        addToast('error', result.message)
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Could not reset your save.')
    } finally {
      setResetting(false)
    }
  }

  const checkAppUpdate = async () => {
    setAppChecking(true)
    setAppProgress(null)
    try {
      setAppUpdate(await window.downy.checkAppUpdate(true))
    } catch (error) {
      setAppUpdate({
        ok: false,
        currentVersion: snapshot.version,
        message: error instanceof Error ? error.message : 'Could not check for updates.'
      })
    } finally {
      setAppChecking(false)
    }
  }

  const installUpdate = async () => {
    setAppInstalling(true)
    setAppProgress({ phase: 'download', percent: 0, message: 'Starting the update…' })
    try {
      const result = await window.downy.installAppUpdate()
      if (!result.ok) {
        setAppInstalling(false)
        setAppProgress(null)
        addToast('error', result.message ?? 'The update could not be installed.')
      } else {
        addToast('info', 'Restarting to finish the update…')
      }
    } catch (error) {
      setAppInstalling(false)
      setAppProgress(null)
      addToast('error', error instanceof Error ? error.message : 'The update could not be installed.')
    }
  }

  return (
    <Modal onClose={close} className="settings-modal">
      <div className="settings-heading">
        <div>
          <h2>Settings</h2>
        </div>
        <div className="settings-version">v{snapshot.version}</div>
      </div>

      <div className="settings-scroll">
        <section className="settings-section">
          <div className="settings-section-title">
            <span>Download defaults</span>
            <span className="settings-hint">New queue items start with these.</span>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <strong>Default type</strong>
              <span>Video or audio only</span>
            </div>
            <div className="segmented settings-segmented">
              <button
                type="button"
                className={settings.defaultKind === 'video' ? 'is-active' : ''}
                onClick={() => updateSettings({ defaultKind: 'video' })}
              >
                Video
              </button>
              <button
                type="button"
                className={settings.defaultKind === 'audio' ? 'is-active' : ''}
                onClick={() => updateSettings({ defaultKind: 'audio' })}
              >
                Audio
              </button>
            </div>
          </div>

          {settings.defaultKind === 'video' ? (
            <>
              <div className="settings-row">
                <div className="settings-label">
                  <strong>Quality</strong>
                </div>
                <SelectField
                  ariaLabel="Default video quality"
                  value={settings.defaultQuality}
                  options={QUALITY_OPTIONS}
                  onChange={(defaultQuality) => updateSettings({ defaultQuality })}
                />
              </div>
              <div className="settings-row">
                <div className="settings-label">
                  <strong>Container</strong>
                </div>
                <SelectField
                  ariaLabel="Default video container"
                  value={settings.defaultContainer}
                  options={CONTAINER_OPTIONS}
                  onChange={(defaultContainer) => updateSettings({ defaultContainer })}
                />
              </div>
            </>
          ) : (
            <>
              <div className="settings-row">
                <div className="settings-label">
                  <strong>Audio format</strong>
                  <span>Audio-only downloads still cost 5 tokens.</span>
                </div>
                <SelectField
                  ariaLabel="Default audio format"
                  value={settings.defaultAudioFormat}
                  options={AUDIO_FORMAT_OPTIONS}
                  onChange={(defaultAudioFormat) => updateSettings({ defaultAudioFormat })}
                />
              </div>
              <div className="settings-row">
                <div className="settings-label">
                  <strong>Bitrate</strong>
                  <span>Best uses the source quality.</span>
                </div>
                <SelectField
                  ariaLabel="Default audio bitrate"
                  value={settings.defaultAudioBitrate}
                  options={AUDIO_BITRATE_OPTIONS}
                  onChange={(defaultAudioBitrate) => updateSettings({ defaultAudioBitrate })}
                />
              </div>
            </>
          )}

          <div className="settings-row">
            <div className="settings-label">
              <strong>Save folder</strong>
              <span className="path-preview" title={settings.outputDir}>
                {settings.outputDir}
              </span>
            </div>
            <button type="button" className="btn btn-ghost btn-small" onClick={chooseFolder}>
              <FolderOpen size={14} />
              Choose
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            <span>Experience</span>
            <span className="settings-hint">Small comforts.</span>
          </div>
          <div className="settings-row">
            <div className="settings-label">
              <strong>Sound effects</strong>
              <span>Coin pickups, countdowns, and the inevitable thud.</span>
            </div>
            <Toggle
              checked={settings.soundEnabled}
              onChange={(soundEnabled) => updateSettings({ soundEnabled })}
              label="Sound effects"
            />
          </div>
          <div className="settings-row">
            <div className="settings-label">
              <strong>Reveal finished downloads</strong>
              <span>Open the folder automatically when a download completes.</span>
            </div>
            <Toggle
              checked={settings.revealWhenDone}
              onChange={(revealWhenDone) => updateSettings({ revealWhenDone })}
              label="Reveal finished downloads in Finder"
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            <span>Recent activity</span>
            <span className="settings-hint">Token earnings and downloads.</span>
          </div>
          <div className="settings-activity">
            {snapshot.wallet.transactions.length === 0 ? (
              <div className="wallet-empty">No activity yet.</div>
            ) : (
              snapshot.wallet.transactions.map((transaction) => (
                <div className="wallet-transaction" key={transaction.id}>
                  <span className={`transaction-icon transaction-${transaction.type}`}>
                    {transaction.type === 'spend' ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownLeft size={13} />
                    )}
                  </span>
                  <span className="transaction-reason" title={transaction.reason}>
                    {transaction.reason}
                  </span>
                  <span className="transaction-date">
                    {new Date(transaction.at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </span>
                  <span className={`transaction-amount transaction-${transaction.type}`}>
                    {transaction.type === 'spend' ? '−' : '+'}
                    {formatTokenCount(transaction.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            <span>Updates</span>
            <span className="settings-hint">Keep Downy current.</span>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <strong>Downy Downloader</strong>
              <span>
                Version {snapshot.version}
                {appUpdate?.updateAvailable && appUpdate.latestVersion
                  ? ` · ${appUpdate.latestVersion} available`
                  : ''}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={checkAppUpdate}
              disabled={appChecking || appInstalling}
            >
              {appChecking ? <Spinner size={14} /> : <RefreshCw size={14} />}
              Check
            </button>
          </div>

          {appUpdate?.ok && appUpdate.updateAvailable && (
            <div className="update-card">
              <div className="update-card-copy">
                <strong>Version {appUpdate.latestVersion} is ready</strong>
                <span>
                  {appProgress?.message ?? 'Download it here and Downy will restart when it is ready.'}
                </span>
                {appProgress?.phase === 'download' && (
                  <div className="update-progress">
                    <span style={{ width: `${Math.max(3, appProgress.percent)}%` }} />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-gold btn-small"
                onClick={installUpdate}
                disabled={appInstalling}
              >
                {appInstalling ? <Spinner size={14} /> : <Download size={14} />}
                {appInstalling ? 'Installing…' : 'Download & install'}
              </button>
            </div>
          )}

          {appUpdate && !appUpdate.ok && <div className="tool-message">{appUpdate.message}</div>}
          {appUpdate?.ok && !appUpdate.updateAvailable && (
            <div className="tool-message">You are running the latest version.</div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            <span>Under the hood</span>
            <span className="settings-hint">Bundled and ready.</span>
          </div>

          <div className="tools-card">
            <div className="tools-card-head">
              <div>
                <div className="tools-title">
                  <Wrench size={15} /> Bundled tools
                </div>
                <div className="tools-sub">No Python or Homebrew needed.</div>
              </div>
              {toolsLoading && <Spinner size={16} />}
            </div>
            <div className="tool-version-row">
              <span>yt-dlp</span>
              <code>{tools?.versions.ytdlp ?? '…'}</code>
            </div>
            <div className="tool-version-row">
              <span>Deno</span>
              <code>{tools?.versions.deno?.replace(/^deno\s+/, '') ?? '…'}</code>
            </div>
            <div className="tool-version-row">
              <span>FFmpeg</span>
              <code>{shorten(tools?.versions.ffmpeg ?? '…', 54)}</code>
            </div>
            <div className="tools-actions">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={checkUpdate}
                disabled={Boolean(toolAction)}
              >
                {toolAction === 'check' ? <Spinner size={14} /> : <RefreshCw size={14} />}
                Check for updates
              </button>
              <button
                type="button"
                className="btn btn-soft btn-small"
                onClick={updateYtdlp}
                disabled={Boolean(toolAction)}
              >
                {toolAction === 'update' ? <Spinner size={14} /> : <Terminal size={14} />}
                Update yt-dlp
              </button>
            </div>
            {updateMessage && <div className="tool-message">{updateMessage}</div>}
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <strong>Auto-check yt-dlp</strong>
              <span>Quietly check for extractor updates every few days.</span>
            </div>
            <Toggle
              checked={settings.autoCheckYtdlp}
              onChange={(autoCheckYtdlp) => updateSettings({ autoCheckYtdlp })}
              label="Automatically check for yt-dlp updates"
            />
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <strong>Browser cookies</strong>
              <span>
                Only needed if YouTube asks you to sign in. Safari may require Full Disk Access.
              </span>
            </div>
            <SelectField
              ariaLabel="Browser cookie source"
              value={settings.cookiesBrowser}
              options={COOKIE_OPTIONS}
              onChange={(cookiesBrowser) => updateSettings({ cookiesBrowser })}
            />
          </div>
        </section>

        <section className="settings-section settings-about">
          <div className="settings-section-title">
            <span>About</span>
            <span className="settings-hint">Small, local, and yours.</span>
          </div>
          <div className="about-card">
            <div className="about-mark">
              <Sparkles size={17} />
            </div>
            <div>
              <strong>Downy Downloader</strong>
              <p>
                A small YouTube downloader with a token wallet. Your queue and downloads live on this
                Mac — no accounts, no analytics.
              </p>
              <div className="about-links">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => window.downy.openExternal('https://github.com/yt-dlp/yt-dlp')}
                >
                  <ExternalLink size={12} /> yt-dlp
                </button>
                <span className="about-sep">·</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => window.downy.openExternal('https://github.com/yt-dlp/yt-dlp')}
                >
                  <Info size={12} /> Licenses & source
                </button>
              </div>
            </div>
          </div>
          <p className="legal-note">
            Download only content you have the rights to. Downy stores everything locally and never
            uploads your links or files.
          </p>
        </section>

        <section className="settings-section settings-danger">
          <div className="settings-section-title">
            <span>Save</span>
            <span className="settings-hint">Start over.</span>
          </div>
          <div className="settings-row">
            <div className="settings-label">
              <strong>Reset save</strong>
              <span>
                Clears your queue and playlists, sets download tokens to 0, and removes activity
                history. Your settings and output folder are kept.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-small"
              onClick={resetSave}
              disabled={resetting || Boolean(snapshot.active)}
            >
              {resetting ? <Spinner size={14} /> : <RotateCcw size={14} />}
              Reset save
            </button>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        <button type="button" className="btn btn-gold" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  )
}

function shorten(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}
