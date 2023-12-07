import { html, LitElement, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { localized, msg } from '@lit/localize';
import { hashProperty, notify, notifyError, onSubmit } from '@holochain-open-dev/elements';

import '@shoelace-style/shoelace/dist/components/card/card.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';

import { weStyles } from '../../shared-styles.js';
import '../../elements/select-group-dialog.js';
import { weStoreContext } from '../../context.js';
import { WeStore } from '../../we-store.js';
import { consume } from '@lit/context';
import { AppEntry, Entity, PublisherEntry } from '../../processes/appstore/types.js';
import {
  CreateAppInput,
  PublisherInput,
  WebHappSource,
  createApp,
  createPublisher,
  deprecateApp,
  getMyApps,
  getMyPublishers,
} from '../../processes/appstore/appstore-light.js';
import { ActionHash } from '@holochain/client';

enum PageView {
  Loading,
  Main,
  CreatePublisher,
  PublishApplet,
  AddApp,
  AppDetail,
}
@localized()
@customElement('publishing-view')
export class PublishingView extends LitElement {
  @consume({ context: weStoreContext })
  weStore!: WeStore;

  @state()
  view: PageView = PageView.Loading;

  @state()
  _myPublisher: Entity<PublisherEntry> | undefined;

  @state()
  _myApps: Entity<AppEntry>[] | undefined;

  @state()
  _creatingPublisher = false;

  resetView() {
    this.view = PageView.Main;
  }

  async firstUpdated() {
    const appStoreClient = this.weStore.appletBundlesStore.appstoreClient;
    const myPublishers = await getMyPublishers(appStoreClient);
    console.log('GOT PUBLISHERS: ', myPublishers);
    console.log('myPublishers.length: ', myPublishers.length === 0);
    if (myPublishers.length === 0) {
      this.view = PageView.CreatePublisher;
      return;
    }
    this._myPublisher = myPublishers[0];
    const myAppsEntities = await getMyApps(appStoreClient);
    this._myApps = myAppsEntities;
    console.log('MY APPS: ', this._myApps);
    this.view = PageView.Main;
  }

  async createPublisher(fields: { publisher_name: string; publisher_website: string }) {
    this._creatingPublisher = true;
    const appAgentClient = this.weStore.appletBundlesStore.appstoreClient;
    const payload: PublisherInput = {
      name: fields.publisher_name,
      location: {
        country: 'unknown',
        region: 'unknown',
        city: 'unknown',
      },
      website: {
        url: fields.publisher_website,
      },
      icon: {
        bytes: new Uint8Array(),
        mime_type: 'image/png',
      },
    };
    const publisherEntry = await createPublisher(appAgentClient, payload);
    this._myPublisher = publisherEntry;
    this._creatingPublisher = false;
    this.view = PageView.Main;
  }

  async publishApplet(fields: {
    title: string;
    subtitle: string;
    description: string;
    icon: { bytes: Uint8Array; mime_type: string };
    webhapp_url: string;
  }) {
    console.log('TRYING TO PUBLISH APPLETS...');
    const appStoreClient = this.weStore.appletBundlesStore.appstoreClient;
    if (!this._myPublisher) throw new Error('No publisher registered yet.');
    const source: WebHappSource = {
      type: 'https',
      url: fields.webhapp_url,
    };

    // TODO try to fetch webhapp, check that it's a valid webhapp and compute hashes

    const randomImageBytes = new Uint8Array();
    window.crypto.getRandomValues(randomImageBytes);

    const payload: CreateAppInput = {
      title: fields.title,
      subtitle: fields.subtitle,
      description: fields.description,
      icon: {
        bytes: randomImageBytes,
        mime_type: 'image/svg+xml',
      },
      publisher: this._myPublisher!.action,
      source: JSON.stringify(source),
      hashes: 'not defined yet',
    };

    console.log('got payload: ', payload);
    await createApp(appStoreClient, payload);
    const myAppsEntities = await getMyApps(appStoreClient);
    this._myApps = myAppsEntities;
    this.view = PageView.Main;
  }

  async deprecateApplet(actionHash: ActionHash) {
    const appStoreClient = this.weStore.appletBundlesStore.appstoreClient;
    await deprecateApp(appStoreClient, {
      base: actionHash,
      message: 'Unkown deprecation reason',
    });
    const myAppsEntities = await getMyApps(appStoreClient);
    this._myApps = myAppsEntities;
    this.requestUpdate();
  }

  renderCreatePublisher() {
    return html`
      <div class="column" style="margin: 16px; flex: 1; align-items: center;">
        <div class="title" style="margin-bottom: 20px;">${msg('Create Publisher')}</div>
        <div style="margin-bottom: 40px;">
          ${msg('Before you can publish applets, you need register yourself as a publisher:')}
        </div>
        <form id="form" ${onSubmit((fields) => this.createPublisher(fields))}>
          <div class="column" style="align-items: center">
            <sl-input
              name="publisher_name"
              required
              .placeholder=${msg('Publisher Name')}
              @input=${(e) => {
                if (!e.target.value || e.target.value.length < 3) {
                  e.target.setCustomValidity('Publisher name must be at least 3 characters.');
                } else {
                  e.target.setCustomValidity('');
                }
              }}
              style="margin-bottom: 10px;"
            ></sl-input>
            <sl-input name="publisher_website" .placeholder=${msg('Website')}></sl-input>
            <sl-button
              variant="primary"
              type="submit"
              .loading=${this._creatingPublisher}
              style="margin-top: 20px;"
            >
              ${msg('Register')}
            </sl-button>
          </div>
        </form>
      </div>
    `;
  }

  renderMain() {
    return html`
      <div class="column" style="align-items: center;">
        <div
          style="position: absolute; top: 20px; right: 20px; font-size: 20px; font-weight: bold;"
        >
          ${this._myPublisher?.content.name}
        </div>
        <div class="title" style="margin-bottom: 40px; margin-top: 30px;">
          ${msg('Your Applets')}
        </div>
        ${this._myApps && this._myApps.length > 0
          ? html`${this._myApps
              .filter((appEntity) => !appEntity.content.deprecation)
              .map(
                (appEntity) =>
                  html` <sl-card class="applet-card">
                    <div class="row" style="align-items: center; flex: 1;">
                      <span>${appEntity.content.title}</span>
                      <span style="display: flex; flex: 1;"></span>
                      <sl-button
                        variant="danger"
                        style="margin-right: 10px;"
                        @click=${() => {
                          this.deprecateApplet(appEntity.action);
                        }}
                        @keypress=${(e: KeyboardEvent) => {
                          if (e.key === 'Enter') {
                            this.view = PageView.PublishApplet;
                          }
                        }}
                        >Deprecate</sl-button
                      >
                      <sl-button variant="primary">Details</sl-button>
                    </div>
                  </sl-card>`,
              )}`
          : html`${msg("You haven't published any applets yet.")}`}
        <sl-button
          variant="success"
          style="margin-top: 40px; margin-bottom: 40px;"
          @click=${() => {
            this.view = PageView.PublishApplet;
          }}
          @keypress=${(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              this.view = PageView.PublishApplet;
            }
          }}
          >${msg('+ Publish New Applet')}</sl-button
        >
      </div>
    `;
  }

  renderPublishApplet() {
    return html`
      <div class="column" style="align-items: center;">
        <div
          style="position: absolute; top: 20px; right: 20px; font-size: 20px; font-weight: bold;"
        >
          ${this._myPublisher?.content.name}
        </div>
        <div class="title" style="margin-bottom: 40px; margin-top: 30px;">
          ${msg('Publish New Applet')}
        </div>
        <form id="form" ${onSubmit((fields) => this.publishApplet(fields))}>
          <div class="column" style="align-items: center; min-width: 600px;">
            <sl-input
              name="title"
              required
              .placeholder=${msg('Title')}
              @input=${(e) => {
                if (!e.target.value || e.target.value.length < 1) {
                  e.target.setCustomValidity('Applet title must not be empty.');
                } else {
                  e.target.setCustomValidity('');
                }
              }}
              style="margin-bottom: 10px; width: 600px;"
            ></sl-input>
            <sl-input
              name="subtitle"
              required
              .placeholder=${msg('Subtitle')}
              @input=${(e) => {
                if (!e.target.value || e.target.value.length < 1) {
                  e.target.setCustomValidity('Applet subtitle must not be empty.');
                } else if (e.target.value.length > 80) {
                  e.target.setCustomValidity('Subtitle is too long.');
                } else {
                  e.target.setCustomValidity('');
                }
              }}
              style="margin-bottom: 10px; width: 600px;"
            ></sl-input>
            <sl-textarea
              name="description"
              required
              .placeholder=${msg('Description')}
              @input=${(e) => {
                if (!e.target.value || e.target.value.length < 1) {
                  e.target.setCustomValidity('Applet description must not be empty.');
                } else if (e.target.value.length > 5000) {
                  e.target.setCustomValidity('Description is too long.');
                } else {
                  e.target.setCustomValidity('');
                }
              }}
              style="margin-bottom: 10px; width: 600px;"
            ></sl-textarea>
            <sl-input
              name="webhapp_url"
              required
              .placeholder=${msg('URL to webhapp release asset (Github, Gitlab, ...)')}
              @input=${(e) => {
                console.log('HELLOOOOO');
                if (!e.target.value || e.target.value === '') {
                  e.target.setCustomValidity('URL to webhapp asset is required.');
                } else if (!e.target.value.startsWith('https://')) {
                  e.target.setCustomValidity('URL must start with https://');
                } else {
                  e.target.setCustomValidity('');
                }
              }}
              style="margin-bottom: 10px; width: 600px;"
            ></sl-input>
            <div class="row" style="margin-top: 40px;">
              <sl-button
                variant="danger"
                type="submit"
                style="margin-right: 10px;"
                @click=${() => {
                  this.view = PageView.Main;
                }}
                @keypress=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    this.view = PageView.Main;
                  }
                }}
                >${msg('Cancel')}
              </sl-button>
              <sl-button variant="primary" type="submit">${msg('Publish')} </sl-button>
            </div>
          </div>
        </form>
      </div>
    `;
  }

  renderContent() {
    switch (this.view) {
      case PageView.Loading:
        return html`<div class="column center-content" style="flex: 1;">Loading...</div>`;
      case PageView.CreatePublisher:
        console.log('Rendering create publisher view');
        return this.renderCreatePublisher();
      case PageView.PublishApplet:
        return this.renderPublishApplet();
      case PageView.Main:
        return this.renderMain();
      default:
        return html`<div class="column center-content" style="flex: 1;">Error</div>`;
    }
  }

  render() {
    return html`
      <div class="column flex-scrollable-y" style="padding: 16px; flex: 1">
        ${this.renderContent()}
      </div>
    `;
  }

  static styles = [
    weStyles,
    css`
      :host {
        display: flex;
        flex: 1;
      }

      .applet-card {
        border-radius: 20px;
        border: 1px solid black;
        min-height: 90px;
        width: 600px;
        margin: 5px 0;
        padding: 10px;
        --border-radius: 15px;
        cursor: pointer;
        border: none;
        --border-color: transparent;
      }

      .title {
        font-size: 30px;
      }

      .btn {
        all: unset;
        margin: 12px;
        font-size: 25px;
        height: 100px;
        min-width: 300px;
        background: var(--sl-color-primary-800);
        color: white;
        border-radius: 10px;
        cursor: pointer;
        box-shadow: 0 2px 5px var(--sl-color-primary-900);
      }

      .btn:hover {
        background: var(--sl-color-primary-700);
      }

      .btn:active {
        background: var(--sl-color-primary-600);
      }
    `,
  ];
}
