import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import {MatFormField} from "@angular/material/form-field";
import {MatAutocomplete, MatAutocompleteTrigger, MatOption} from "@angular/material/autocomplete";
import {AsyncPipe, NgForOf} from "@angular/common";
import {MatTooltip} from "@angular/material/tooltip";
import {MatInput, MatLabel} from "@angular/material/input";


@Component({
    selector: 'firebird-resource-select',
    imports: [
        MatFormField,
        MatAutocompleteTrigger,
        MatAutocomplete,
        MatOption,
        AsyncPipe,
        NgForOf,
        MatTooltip,
        MatInput,
        MatLabel,
        ReactiveFormsModule
    ],
    templateUrl: './resource-select.component.html',
    styleUrl: './resource-select.component.scss'
})
export class ResourceSelectComponent implements OnInit {

  /**
   * List of resources to display in autocomplete
   */
  @Input() options: string[] = [];

  /**
   * Watermark text of the control
   */
  @Input() label: string = 'Select value';

  /**
   * Emitted every time value is changed by selecting or typing in
   */
  @Output() valueChange = new EventEmitter<string>();

  /**
   * The main and resulting value of the control
   */
  public value: FormControl = new FormControl();

  /**
   * List of filtered options depending on user input
   */
  public filteredOptions: Observable<string[]> = this.value.valueChanges.pipe(
    startWith(''),
    map(input=>this.filterOptions(input))
  );

  ngOnInit(): void {
    // Connect value changes with the control output
    this.value.valueChanges.subscribe(()=>{
      this.valueChange.emit(this.value.value)
    });
  }

  /**
   * Filters options depending on what is the value
   * @param inputValue
   * @private
   */
  private filterOptions(inputValue: any) {

    // options could be undefined
    if(!this.options) return [];

    // Safeguard the name. inputValue could be string or RemoteResourceOption or whatever...
    const name = typeof inputValue === 'string' ? inputValue : (inputValue?.name ?? '');

    // Get options containing "name"
    let filteredList = name ? this._selectOptions(name) : this.options.slice();

    // Explanation of the return: if we have only 1 option, that fully fit the name,
    // we probably have it selected already. Which means we want to show everything, so users can select something else
    return (filteredList.length == 1 && name === filteredList[0]) ? this.options.slice() : filteredList;
  }

  /**
   * Retrieves the options which .name contains subString.
   *
   * @param {string} subString - sub string that every option.name is tested by.
   * @return {string[]} The filtered remote resource options.
   */
  private _selectOptions(subString: string): string[] {
    const filterValue = subString.toLowerCase();
    return this.options.filter(option => option.toLowerCase().includes(filterValue));
  }

  /**
   * Display proper value if value is selected or typed in by user
   *
   * @param {any | string} input - It is a string (if user is typing) or RemoteResourceOption (if it is selected)
   * @return {string} We should return some string instead
   */
  onDisplayValueChange(input: any | string): string {
    let result: string = '';
    if (typeof input === 'string') {
      result = input;
    } else if (input && typeof input.url === 'string') {
      result = input.url;
    }
    return result;
  }
}
