import {Component, OnInit, SecurityContext} from '@angular/core';
import {ShellComponent} from "../../components/shell/shell.component";
import {MatIcon} from "@angular/material/icon";
import {MarkdownComponent, MARKED_OPTIONS, provideMarkdown} from "ngx-markdown";
import {MatIconButton} from "@angular/material/button";
import {HttpClient} from "@angular/common/http";
import {MatCard, MatCardTitle} from "@angular/material/card";
import {MatListItem, MatNavList} from "@angular/material/list";
import {ActivatedRoute, Router} from "@angular/router";


interface DocPage {
  title: string;
  path: string;
  slug: string;
}

// CRITICAL: Import order matters for Prism!
// 1. Core Prism first
import 'prismjs';

// 2. Base languages that others depend on
import 'prismjs/components/prism-markup';  // HTML/XML
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';    // Required for C, JS, TS, CPP

// 3. C language (required for C++)
import 'prismjs/components/prism-c';        // Required for CPP!

// 4. JavaScript (required for TS and JSON)
import 'prismjs/components/prism-javascript';  // Required for TS and JSON

// 5. Languages that extend JavaScript
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';  // Required for json5

// 6. Languages that extend JSON
import 'prismjs/components/prism-json5';  // Depends on prism-json

// 7. C++ (depends on C)
import 'prismjs/components/prism-cpp';  // Depends on prism-c

// 8. Other languages
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-python';

// Set theme scheme
import 'prismjs/themes/prism-okaidia.css';

@Component({
  selector: 'app-page-help',
  imports: [
    ShellComponent,
    MatIcon,
    MarkdownComponent,
    MatIconButton,
    MatCard,
    MatCardTitle,
    MatListItem,
    MatNavList
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
export class HelpComponent implements OnInit{
  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (typeof window !== 'undefined' && (window as any).Prism) {
      console.log('Prism languages loaded:', Object.keys((window as any).Prism.languages));
    }

    // Subscribe to route parameter changes
    this.route.params.subscribe(params => {
      const pageSlug = params['page'];
      if (pageSlug) {
        const page = this.docPages.find(p => p.slug === pageSlug);
        if (page) {
          this.docUrl = page.path;
        }
      } else {
        // Default to intro page when no parameter
        this.docUrl = 'assets/doc/intro.md';
      }
    });
  }

  /**
   * The current Markdown file being displayed
   */
  docUrl = 'assets/doc/intro.md';

  /**
   * A simple list of documentation pages to show in the left pane.
   * `path` should match your .md files in assets/docs folder.
   * `slug` is used in the URL (e.g., /help/intro)
   */
  docPages: DocPage[] = [
    { title: 'Introduction', path: 'assets/doc/intro.md', slug: 'intro' },
    { title: 'Installation', path: 'assets/doc/pyrobird.md', slug: 'pyrobird' },
    { title: 'DD4Hep plugin', path: 'assets/doc/dd4hep-plugin.md', slug: 'dd4hep-plugin' },
    // ...add more as needed
  ];


  /**
   * When a user clicks on a page, navigate to the new URL.
   * The route parameter subscription will handle updating docUrl.
   */
  selectPage(page: DocPage) {
    this.router.navigate(['/help', page.slug]);
  }

  /**
   * (Optional) Suppose you also want a debug button in the header:
   */
  onDebugClick() {
    console.log('Debug button clicked');
  }
}
