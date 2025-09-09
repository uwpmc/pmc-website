const mysql_connection = require("./public/scripts/mysql_connection.js");
const connection = mysql_connection.pool;

var filter_box, filter_icon, searchbar, check_filter_number;
var checkboxes = [];
var books = [];
var book_topics = [];

// Searchbar filter: On searchbar change, limits results to what fit the search bar.
// Checkbox filter: On uncheck, limits results to what fits those categories. If this unchecks all boxes, remove the filters
//                  On check, need to check if boxes that were previously hidden due to that category can now be visible
// Clear all filters: Also removes all filters
// Idea: use display for one and visibility for the other! (OR OPACITY 0)

// Searchbar --------------------------------------------------------------
function filter_books() {
  var filter, book, txt;
  filter = searchbar.value.toUpperCase();
  for (i = 0; i < books.length; i++) {
    book = books[i];
    txt = book.getAttribute("id");
    // Check search bar fit
    if (txt.toUpperCase().indexOf(filter) > -1) {
      // Check filter fit
      fits_filter = book_topics[i] & check_filter_number;
      if (fits_filter || check_filter_number == 0) {
        book.style.display = "";
      } else {
        book.style.display = "none";
      }
    } else {
      book.style.display = "none";
    }
  }
}

// Setup --------------------------------------------------------------
async function setup() {
  check_filter_number = 0;

  //  Get filterbox
  filter_box = await document.getElementById("filter-box");
  filter_icon = await document.getElementById("filter-icon");

  // Get searchbar
  searchbar = await document.getElementById("searchbar");

  // Get checkboxes
  checkboxes = await Array.from(document.getElementsByName("checkbox"));
  for (i = 0; i < checkboxes.length; ++i) {
    checkbox = checkboxes[i];
    checkbox.addEventListener("change", function () {
      if (this.checked == true) {
        check_filter_number += Math.pow(2, Number(this.getAttribute("id")) - 1);
      } else {
        check_filter_number -= Math.pow(2, Number(this.getAttribute("id")) - 1);
      }
      filter_books();
    });
  }

  // Get books
  books = await Array.from(document.getElementsByClassName("book-container"));
  book_topics = await books.map((book) => Number(book.getAttribute("name")));
}
window.onLoad = setup();

// Filter clicking
async function filter_visible() {
  filter_box.style.display = "block";
  filter_icon.style.backgroundColor = "rgb(234, 234, 234)";
}

async function filter_hidden() {
  filter_box.style.display = "none";
  filter_icon.style.backgroundColor = "white";
}
