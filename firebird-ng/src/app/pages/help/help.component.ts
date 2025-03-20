import {Component, SecurityContext} from '@angular/core';
import {ShellComponent} from "../../components/shell/shell.component";
import {MatIcon} from "@angular/material/icon";
import {MarkdownComponent, MarkdownModule, MARKED_OPTIONS, provideMarkdown} from "ngx-markdown";
import {MatIconButton} from "@angular/material/button";
import {HttpClient, provideHttpClient} from "@angular/common/http";
import {MatCard, MatCardContent, MatCardTitle} from "@angular/material/card";
import {MatListItem, MatNavList} from "@angular/material/list";
import {NgForOf} from "@angular/common";

interface DocPage {
  title: string;
  path: string;
}


@Component({
  selector: 'app-page-help',
  imports: [
    ShellComponent,
    MatIcon,
    MarkdownComponent,
    MatIconButton,
    MatCard,
    MatCardContent,
    MatCardTitle,
    MatListItem,
    MatNavList,
    NgForOf,
  ],
  providers: [
      provideMarkdown({
        loader: HttpClient,
        sanitize: SecurityContext.NONE,
        markedOptions: {
          provide: MARKED_OPTIONS,
          useValue: {
            gfm: true,
            breaks: false,
            pedantic: false,
          }
        }
      })
  ],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss'
})
export class HelpComponent {

  /**
   * The current Markdown file being displayed
   */
  docUrl = 'assets/docs/intro.md';

  /**
   * A simple list of documentation pages to show in the left pane.
   * `path` should match your .md files in assets/docs folder.
   */
  docPages: DocPage[] = [
    { title: 'Introduction', path: 'assets/docs/intro.md' },
    { title: 'Installation', path: 'assets/docs/pirobird.md' },
    { title: 'DD4Hep plugin', path: 'assets/docs/dd4hep-plugin.md' },
    // ...add more as needed
  ];

  /**
   * When a user clicks on a page, update the docUrl so <markdown> reloads it.
   */
  selectPage(page: DocPage) {
    this.docUrl = page.path;
  }

  /**
   * (Optional) Suppose you also want a debug button in the header:
   */
  onDebugClick() {
    console.log('Debug button clicked');
  }
}
