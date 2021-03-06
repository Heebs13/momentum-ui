import { AfterContentChecked, AfterContentInit, ChangeDetectorRef, Component, ContentChildren, ElementRef, EventEmitter, forwardRef, HostBinding, HostListener, Input, OnDestroy, OnInit, Output, QueryList, TemplateRef, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import findIndex from 'lodash-es/findIndex';
import isEqual from 'lodash-es/isEqual';
import uniqueId from 'lodash-es/uniqueId';
import { Subscription } from 'rxjs';
import { ButtonComponent } from '../button/button.component';
import { TableService } from '../data-table/data-table.service';
import { TemplateNameDirective } from '../data-table/shared';
import { FilterUtils } from '../utils/filterUtils/filters';
import { SelectService } from './select.service';

const SELECT_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  // tslint:disable-next-line: no-use-before-declare
  useExisting: forwardRef(() => SelectComponent),
  multi: true
};

export class SelectChange {
  constructor(
    public source: SelectComponent,
    public value: any
  ) { }
}

@Component({
  selector: 'md-select',
  template: `
    <button
      md-button
      cdkOverlayOrigin
      #trigger="cdkOverlayOrigin"
      [attr.name]='id'
      aria-label="select button"
      [attr.id]='id'
      (click)='toggle()'
      [ngClass]="[
        disabled ? 'disabled' : '',
        buttonClass
      ]"
      class='md-input md-select__input'
      [ngStyle]="buttonStyle"
      type="button"
    >
      <div class='md-select__label' id="{{id}}__label">

        <ng-container *ngTemplateOutlet="selectedOptionTemplate; context: {$implicit: finalOption}"></ng-container>

        <span *ngIf="!selectedOptionTemplate">
          {{isMulti && selection && selection.length > 0 ? selection.length + ' Items Selected'
          : finalOption && !isMulti ? finalOption.label
          : defaultValue ? defaultValue
          : placeholder ? placeholder
          : 'Select An Option'}}
        </span>

        <md-icon name="arrow-down_16"></md-icon>
      </div>
    </button>

    <md-input-message
      *ngIf='isError && errorMsg !== ""'
      class='md-input__messages'
    >
      {{errorMsg}}
    </md-input-message>

    <md-input-message
      *ngIf='(isWarn && warnMsg !== "") && !(isError && errorMsg !== "")'
      class='md-input__messages'
    >
      {{warnMsg}}
    </md-input-message>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="overlayOpen"
      [cdkConnectedOverlayWidth]="this.anchorWidth"
      [cdkConnectedOverlayOffsetY]="6"
      [cdkConnectedOverlayPanelClass]="['md-select__dropdown', overlayClass]"
      [cdkConnectedOverlayHasBackdrop]="true"
      [cdkConnectedOverlayBackdropClass]="'cdk-overlay-transparent-backdrop'"
      (backdropClick)="close()"
      (detach)="close()"
    >
      <div
        *ngIf="filter"
        class="md-select__filter"
        (click)="$event.stopPropagation()"
      >
        <md-input-container>
          <input
            mdInput
            shape="pill"
            #filterSearch
            aria-autocomplete="list"
            [(ngModel)]="filterValue"
            [placeholder]="filterPlaceholder"
            (input)="onFilter($event)"
            (keydown)="_handleOpenKeydown($event)"
            (keydown.enter)="$event.preventDefault()"
          >
          <md-input-section
            *ngIf="hasSearchIcon"
          >
            <md-icon name="search_20"></md-icon>
          </md-input-section>
        </md-input-container>
      </div>

      <div
        class="md-list md-list--vertical"
        [style.max-height]="scrollHeight"
        role="listbox"
        style="align-items: normal; overflow: scroll; overflow-x:hidden"
      >
        <ng-container>
          <ng-container
            *ngTemplateOutlet="itemslist; context: {
              $implicit: selectOptionsToDisplay,
              selectedOption: selectedOption
            }">
          </ng-container>
        </ng-container>

        <ng-template #itemslist let-options let-selectedOption="selectedOption">
          <ng-template ngFor let-option let-i="index" [ngForOf]="options">
            <md-select-item
              [option]="option"
              [optionClass]="optionClass"
              [selected]="selectedOption === option"
              (handleClick)="onSelectItemClick($event)"
              [selectItemSize]="selectItemSize"
              [template]="optionTemplate">
            </md-select-item>
          </ng-template>
        </ng-template>

        <li
          *ngIf="filter && selectOptionsToDisplay && selectOptionsToDisplay.length === 0"
          class="md-select__filter--empty"
        >
          {{noResultsMessage}}
        </li>
      </div>
    </ng-template>
  `,
  styles: [],
  providers: [SELECT_VALUE_ACCESSOR, SelectService, TableService],
  host: {
    class: 'md-input-container md-select',
    '[class.disabled]': 'disabled',
    '[class.md-error]': 'isError',
    '[class.md-warning]': 'isWarn'
  }
})
export class SelectComponent implements AfterContentChecked, AfterContentInit, ControlValueAccessor {

  overlayOpen = false;
  anchorWidth = null;
  _options: any[];
  selectOptionsToDisplay: any[];
  selectedOption: any;
  finalOption: any;
  selectedItemUpdated: boolean;
  value: any;
  filterValue: string;
  _selection: any;
  selectionKeys: any = {}; // for adding and removing to multi-selection
  preventPropagation: boolean;
  optionTemplate: TemplateRef<any>;
  selectedOptionTemplate: TemplateRef<any>;

  /** @prop set the scroll height of the overlay | '' */
  @Input() scrollHeight: string = '22rem';
  /** @prop set the placeholder for the select */
  @Input() placeholder: string;
  /** @prop passes in the data table row index */
  @Input() tableRowIndex: number;
  /** @prop set which key to show as the option label | '' */
  @Input() optionLabel: string;
  /** @prop show the filter search | false */
  @Input() filter: boolean = false;
  /** @prop set which key or keys the filter will use, filtering by multiple keys example: '[name, id]' | 'label' */
  @Input() filterBy: string | string[]  = 'label';
  /** @prop set how the string should be filtered | 'contains' */
  @Input() filterMode: string = 'contains';
  /** @prop set the filter search placeholder | '' */
  @Input() filterPlaceholder: string = '';
  /** @prop set the aria-label on the filter input | '' */
  @Input() ariaFilterLabel: string = '';
  /** @prop dataKey can be used to find selected options from multi-select, otherwise findIndex will run */
  @Input() dataKey: string = null;
  /** @prop message to show when filter returns null | 'No Results Found' */
  @Input() noResultsMessage: string = 'No Results Found';
  /** @prop set the height in px of each select option */
  @Input() selectItemSize: number;
   /** @prop add optional css class to the overlay | null */
  @Input() overlayClass: string = null;
  /** @prop add search icon on the filter search input | true */
  @Input() hasSearchIcon: boolean = true;
  /** @prop set the select item options */
  @Input() get options(): any[] {
    return this._options;
  }

  set options(item: any[]) {
    const options = this.optionLabel ? this.makeSelectOptions(item, this.optionLabel) : item;
    this._options = options;
    this.selectOptionsToDisplay = this._options;
    this.updateSelectedItem(this.value);

    if (this.filterValue && this.filterValue.length) {
      this.startFilter();
    }
  }

  /** @prop sets the selection from multi-select */
  @Input() get selection(): any {
    return this._selection;
  }

  set selection(item: any) {
    this._selection = item;

    if (!this.preventPropagation) {
      this.updateSelectionKeys();
      this.selectService.onSelectionChange();
    }
    this.preventPropagation = false;
  }

  /** @prop set the inline style of the select button | null */
  @Input() buttonStyle: Object = null;
  /** @prop Optional CSS button class name | '' */
  @Input() buttonClass: string = '';
  /** @prop Optional CSS class on each select option */
  @Input() optionClass: string = '';
  /** @prop Set the default value for the select | '' */
  @Input() defaultValue: string = '';
  /** @prop Disable the Select Component | false */
  @HostBinding('attr.disabled') @Input() public disabled: boolean = false;
  /** @prop Set ID for Select Component | null */
  @Input() id = uniqueId('md-select-');
  /** @prop Optional prop to know if user is able to select multiple options | false */
  @Input() isMulti = false;
  /** @prop show the warning message | false */
  @HostBinding('class.md-warn') @Input() public isWarn: boolean = false;
  /** @prop message to show when there is a warning | '' */
  @Input() warnMsg: string = '';
  /** @prop show the error message | false */
  @HostBinding('class.md-error') @Input() public isError: boolean = false;
  /** @prop message to show when there is a error | '' */
  @Input() errorMsg: string = '';

  /** @prop emitter to fire the select option value change  */
  @Output() handleChange: EventEmitter<any> = new EventEmitter();
  /** @prop emitter to fire after showing the overlay select options panel */
  @Output() handleShow: EventEmitter<any> = new EventEmitter();
  /**@prop emit function when multi-checked selection changes */
  @Output() selectionChange: EventEmitter<any> = new EventEmitter();
  /**@prop emit function when row is checked */
  @Output() rowCheck: EventEmitter<any> = new EventEmitter();
  /**@prop emit funciton when row is unchecked */
  @Output() rowUncheck: EventEmitter<any> = new EventEmitter();
  /**@prop emit function when the filter value changes */
  @Output() filterValueChange: EventEmitter<any> = new EventEmitter();


  @ViewChild(ButtonComponent) originButton;
  @ViewChild('filterSearch') filterViewChild: ElementRef;
  @ContentChildren(TemplateNameDirective) templates: QueryList<TemplateNameDirective>;

  /** Handles keyboard events when the selected is open. */
  @HostListener('keydown', ['$event'])  _handleOpenKeydown = (event): void => {

    if (!this.selectOptionsToDisplay || this.selectOptionsToDisplay.length === null || !this.overlayOpen) {
      return;
    }
    // tslint:disable-next-line: deprecation
    const key = event.key || event.which || event.keyCode;

    let selectedItemIndex;

    switch (key) {

    case 'ArrowDown':
    case 40:
      if (!this.overlayOpen && event.altKey) {
        this.open();
      } else {

        selectedItemIndex = this.selectedOption ? this.findSelectOptionIndex(this.selectedOption.value, this.selectOptionsToDisplay) : -1;
        const nextEnabledOption = this.findNextOption(selectedItemIndex);
        if (nextEnabledOption) {
          this.selectItem(event, nextEnabledOption);
          this.selectedItemUpdated = true;
        }
      }
      event.preventDefault();
    break;

    case 'ArrowUp':
    case 38:

        selectedItemIndex = this.selectedOption ? this.findSelectOptionIndex(this.selectedOption.value, this.selectOptionsToDisplay) : -1;
        const prevEnabledOption = this.findPrevOption(selectedItemIndex);
        if (prevEnabledOption) {
          this.selectItem(event, prevEnabledOption);
          this.selectedItemUpdated = true;
        }
        event.preventDefault();
      break;

      case 'Enter':
      case 13:
        this.forceSelectItem(true);
        event.preventDefault();
      break;

      case 'Escape':
      case 'Tab':
      case 27:
      case 9:
        this.close();
      break;
    }
  }

  findPrevOption(index) {
    let prevEnabledOption;

    if (this.selectOptionsToDisplay && this.selectOptionsToDisplay.length) {
      for (let i = (index - 1); 0 <= i; i--) {
        const option = this.selectOptionsToDisplay[i];
        if (option.disabled) {
            continue;
        } else {
          prevEnabledOption = option;
          break;
        }
      }

      if (!prevEnabledOption) {
        for (let i = this.selectOptionsToDisplay.length - 1; i >= index ; i--) {
          const option = this.selectOptionsToDisplay[i];
          if (option.disabled) {
            continue;
          } else {
            prevEnabledOption = option;
            break;
          }
        }
      }
    }
    return prevEnabledOption;
  }

  findNextOption(index) {
    let nextEnabledOption;

    if (this.selectOptionsToDisplay && this.selectOptionsToDisplay.length) {
      for (let i = (index + 1); index < (this.selectOptionsToDisplay.length - 1); i++) {
        const option = this.selectOptionsToDisplay[i];

        if (option.disabled) {
          continue;
        } else {
          nextEnabledOption = option;
          break;
        }
      }

      if (!nextEnabledOption) {
        for (let i = 0; i < index; i++) {
          const option = this.selectOptionsToDisplay[i];

          if (option.disabled) {
            continue;
          } else {
            nextEnabledOption = option;
            break;
          }
        }
      }
    }
    return nextEnabledOption;
  }

  makeSelectOptions(option: any[], label: string) {
    let selectItems;
    if (option && option.length) {
      selectItems = [];
      for (const item of option) {
        selectItems.push({label: item[label], value: item});
      }
    }
    return selectItems;
  }


  updateSelectedItem(item: any) {
    this.selectedOption = this.findSelectOption(item, this.selectOptionsToDisplay);
    this.finalOption = this.selectedOption;
    this.selectedItemUpdated = true;
    return this.selectedOption;
  }

  findSelectOption(item: any, options: any[]) {
    const index: number = this.findSelectOptionIndex(item, options);
    return (index !== -1) ? options[index] : null;
  }

  findSelectOptionIndex(item: any, options: any[]): number {
    let index: number = -1;
    if (options) {
      for (let i = 0; i < options.length; i++) {
        if ((item === null && options[i].value === null) || isEqual(item, options[i].value) || isEqual(item, options[i].label)) {
          index = i;
          break;
        }
      }
    }
    return index;
  }

  onFilter(event): void {
    const inputValue = event.target.value;
    if (inputValue && inputValue.length) {
      this.filterValue = inputValue;
      this.startFilter();
    } else {
      this.filterValue = null;
      this.selectOptionsToDisplay = this.options;
    }
  }

  startFilter() {
    const filterBy: string[] = Array.isArray(this.filterBy) ? this.filterBy : this.filterBy.split(',');

    this.filterValueChange.emit(this.filterValue);

    if (this.options && this.options.length) {
      this.selectOptionsToDisplay = FilterUtils.filter(this.options, filterBy, this.filterValue, this.filterMode);
    }
  }

  resetFilter(): void {
    if (this.filterViewChild && this.filterViewChild.nativeElement) {
      this.filterValue = null;
      this.filterViewChild.nativeElement.value = '';
    }
    this.selectOptionsToDisplay = this.options;
  }

  onSelectItemClick(event) {
    const option = event.option;

    if (!option.disabled) {
      this.selectedOption = option;
      this.finalOption = option;
      this.value = option.value;
      this.onModelChange(option.value);

      this.handleChange.emit({
        value: option.value
      });

      if (this.tableRowIndex >= 0) {
        this.tableService.onSelectChange(option.value, this.tableRowIndex);
      }
    }

    if (!this.isMulti) {
      this.close();
    }
  }

  private forceSelectItem(emit: boolean = false) {
    if (this.selectOptionsToDisplay && this.selectOptionsToDisplay.length > 0) {
      this.onModelChange(this.value);
      this.finalOption = this.selectedOption;
      if (emit) {
        this.handleChange.emit({
          value: this.value
        });
      }

      if (this.tableRowIndex >= 0) {
        this.tableService.onSelectChange(this.value, this.tableRowIndex);
      }

      if (this.isMulti) {
        this.toggleRowWithCheckbox(this.selectedOption.value);
      } else if (emit) {
        this.close();
      }
    }
  }

  selectItem(_event, option) {
    if (this.selectedOption !== option) {
      this.selectedOption = option;
      this.value = option.value;
    }
  }

  isSelected(rowData) {
    if (rowData && this.selection) {
      if (this.dataKey) {
        for (let i = 0; i < this.selection.length; i++) {
          if (this.selection[i][this.dataKey] === rowData[this.dataKey]) {
            this.selectionKeys[rowData[this.dataKey]] = 1;
          }
        }
        return this.selectionKeys[rowData[this.dataKey]] !== undefined; // found in selection
      } else {
        if (this.selection instanceof Array) {
          return findIndex(this.selection, rowData) > -1;
        } else {
          return this.selection === rowData;
        }
      }
    }
    return false;
  }

  toggleRowWithCheckbox(rowData: any) {
    this.selection = this.selection || [];
    const isChecked = this.isSelected(rowData);

    const rowDataKeyValue = this.dataKey ? String(rowData[this.dataKey]) : null;

    this.preventPropagation = true;

    if (isChecked) { // then uncheck from selection
      const checkedIndex = findIndex(this.selection, rowData);

      this._selection = this.selection.filter((item, i) => i !== checkedIndex);
      this.selectionChange.emit(this._selection);

      this.rowUncheck.emit({
        data: rowData,
      });

      if (rowDataKeyValue) {
        delete this.selectionKeys[rowDataKeyValue];
      }

    } else { // add to selection
      this._selection = this.selection ? [...this.selection, rowData] : [rowData];
      this.selectionChange.emit(this._selection);

      this.rowCheck.emit({
        data: rowData,
      });

      if (rowDataKeyValue) {
        this.selectionKeys[rowDataKeyValue] = 1;
      }
    }
    this.selectService.onSelectionChange();
  }

  updateSelectionKeys() {
    if (this.dataKey && this._selection) {

      this.selectionKeys = {};
      if (Array.isArray(this._selection)) {
        for (const data of this._selection) {
          this.selectionKeys[String(data[this.dataKey])] = 1;
        }
      } else {
        this.selectionKeys[String(this._selection[this.dataKey])] = 1;
      }
    }
  }

  constructor(
    public selectService: SelectService,
    public tableService: TableService,
    public el: ElementRef,
    private cd: ChangeDetectorRef
  ) { }

  ngAfterContentChecked () {
    this._setAnchorWidth(this.originButton.el.nativeElement);
  }

  ngAfterContentInit() {
    this.templates.forEach((item) => {
      switch (item.getType()) {
        case 'option':
          this.optionTemplate = item.template;
        break;

        case 'selectedOption':
          this.selectedOptionTemplate = item.template;
        break;

        default:
          this.optionTemplate = item.template;
        break;
      }
    });
  }

  toggle = (): void => {
    this.overlayOpen ? this.close() : this.open();
  }

  open = (): void => {
    if (!this.options) {
      return;
    }
    this.handleShow.emit();
    this.overlayOpen = true;
    this.cd.detectChanges();

    if (this.filterViewChild && this.filterViewChild.nativeElement) {
      this.filterViewChild.nativeElement.focus();
    }
    const activeItem = document.querySelector('.md-select-item--focus');

    if (activeItem) {
      activeItem.scrollIntoView();
    }
  }

  close = (): void => {
    if (this.overlayOpen) {
      this.overlayOpen = false;
    }
    this.selectedOption = this.finalOption;
    this.onFilter({target: ''});
  }

  onModelChange: Function = () => {};
  onModelTouched: Function = () => {};

  writeValue(value: any): void {
    if (this.filter) {
      this.resetFilter();
    }
    const item = this.updateSelectedItem(value);
    this.value = (item === null) ? null : item.value;
    this.forceSelectItem();
    this.cd.markForCheck();
  }
  registerOnChange(fn: Function): void {
    this.onModelChange = fn;
  }
  registerOnTouched(fn: Function): void {
    this.onModelTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  private _setAnchorWidth = (elementAnchor) => {
    const anchor = elementAnchor && elementAnchor.getBoundingClientRect();
    this.anchorWidth = anchor.width;
  }
}

@Component({
  selector: 'md-select-item',
  template: `
    <div
      (click)="onSelectOptionClick($event)"
      (keydown)="sc._handleOpenKeydown($event)"
      role="option"
      [attr.aria-label]="option.label"
      [ngStyle]="{'height': selectItemSize + 'px'}"
      class="md-list-item"
      [ngClass]="[
        selected ? 'active md-select-item--focus' : '',
        optionClass
      ]"
    >

    <div *ngIf="!template && !sc.isMulti" class="md-list-item__center">{{option.label||'empty'}}</div>
      <!-- Multi Check Box Conditional -->

      <ng-container *ngIf="sc.isMulti">
        <md-select-checkbox
          [data]="option.value"
          [label]="option.label">
        </md-select-checkbox>
      </ng-container>

      <ng-container *ngTemplateOutlet="template; context: {$implicit: option}"></ng-container>
    </div>
  `
})
export class SelectItemComponent {

  @Input() option;
  @Input() optionClass;
  @Input() selected: boolean;
  @Input() selectItemSize: number;
  @Input() template: TemplateRef<any>;
  @Output() handleClick: EventEmitter<any> = new EventEmitter();

  constructor(public sc: SelectComponent) {}

  onSelectOptionClick(_event: Event) {
    this.handleClick.emit({
      option: this.option
    });

    if (this.sc.isMulti) {
      this.sc.toggleRowWithCheckbox(this.option.value);

      if (this.sc.filterViewChild && this.sc.filterViewChild.nativeElement) {
        this.sc.filterViewChild.nativeElement.focus();
      } else {
        this.sc.originButton.el.nativeElement.focus();
      }
    }
  }
}

@Component({
  selector: 'md-select-checkbox',
  template: `
    <div
      class="md-select__checkbox--wrapper"
      [ngClass]="[className]"
      (click)="handleClick($event)"
    >
      <div>
        <md-checkbox
          name="{{id}}-checkbox"
          [value]="label"
          [label]="label"
          [(checkStatus)]="checkStatus"
          (checkStatusChange)="changeCheck($event)"
          htmlId="{{id}}-checkbox">
        </md-checkbox>
      </div>
    </div>
  `
})
export class SelectCheckboxComponent implements OnInit, OnDestroy {

  @Input() data: any;
  @Input() label: string = '';
  @Input() className: string = '';

  @HostBinding('attr.id') @Input() id: string = uniqueId('md-select-item-');

  checkStatus: boolean;
  subscription: Subscription;

  constructor(public sc: SelectComponent, public selectService: SelectService) {
    this.subscription = this.sc.selectService.selectionSource$.subscribe(() => {
      this.checkStatus = this.sc.isSelected(this.data);
    });
  }

  ngOnInit() {
    this.checkStatus = this.sc.isSelected(this.data);
  }

  handleClick(_event: Event) {
    this.sc.toggleRowWithCheckbox(this.data);
  }

  changeCheck(event) {
    this.checkStatus = event;
    this.sc.toggleRowWithCheckbox(this.data);
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
