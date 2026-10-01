var pathname = $(location).attr("pathname");
var bookIdPosition = pathname.lastIndexOf("/") + 1;
var isBookInUse = false;
var bookId;

// doAjaxQuery('GET', '/api/v1/books/' + pathname.substr(bookIdPosition), null, function(res) {
//     view.fillBookInfo(res.data);
//     if (res.data.event) {
//         isBookInUse = true;
//         bookId = res.data.id;
//     }
// });

/* --------------------Show the result, for sending the -----------------------
----------------------email in the queue for the book ---------------------- */
// var showResultSendEmailToQueue = function(email, result) {
//     var busy = $('#bookID').attr('busy');
//     $('.form-queue', '.btnBookID', (busy === null) ? '.freeBook' : '.busyBook').css('display', 'none');
//     $('.response').css('display', 'block');
//     $('span.youEmail').text(' ' + email);
// };

/*--------------- Send email. Get in Queue in for a book ---------------------*/
// var sendEmailToQueue = function(id, email) {
//     doAjaxQuery('GET', '/api/v1/books/' + id + '/order?email=' + email, null, function(res) {
//         showResultSendEmailToQueue(email, res.success);
//     });
// };

/* --------------- Checking validity of email when typing in input -----------*/
// $('.orderEmail').keyup(function(event) {
//     var email = $(this).val();
//     var isEmail = controller.validateEmail(email);
//     if (email === '') {
//         $('.input-group').removeClass('has-error has-success');
//         view.hideElement('.glyphicon-remove', '.glyphicon-ok');
//     } else {
//         if (isEmail) {
//             view.showSuccessEmail();
//             if (event.keyCode == 13) {
//
//                 var id = $('#bookID').attr('book-id');
//                 sendEmailToQueue(id, email);
//             }
//         } else {
//             view.showErrEmail();
//         }
//     }
// });
/*------------------ Sending email by clicking on the button ----------------*/
$(".btnBookID").click(async function (event) {
  event.preventDefault();
  // var email = $('.orderEmail').val();
  // var isEmail = controller.validateEmail(email);
  // if (isEmail) {
  //     view.showSuccessEmail();
  //     var id = $('#bookID').attr('book-id');
  //     sendEmailToQueue(id, email);
  // } else {
  //     view.showErrEmail();
  // }
  // if (isBookInUse) {
  //     view.showSubscribe(
  //         "Сейчас эта книга находится на руках, у одного из наших учеников." +
  //         " Оставь свой email и мы сообщим, как только книга вновь" +
  //         " появится в библиотеке", bookId);
  // } else
  {
    var currentUrl = window.location.href;
    const bookId = parseInt(currentUrl.split("/").pop()) || 0;
    const postData = {
      method: "POST",
      body: JSON.stringify({ bookId: bookId }),
      headers: {
        "Content-Type": "application/json",
      },
    };
    try {
      console.log("1. Початок кліку спрацював");
      const apiResponse = await fetch("http://localhost:5000/book/", postData);
      if (!apiResponse.ok) {
        throw new Error(`Помилка запиту: ${apiResponse.status}`);
      }
      console.log("2");
      const modal = `<div class="modal fade" tabindex="-1" role="dialog" id="modalTour">
  <div class="modal-dialog" role="document">
    <div class="modal-content" style="border-radius: 12px; padding: 20px;">
      <div class="modal-body">
        <h2 style="font-weight: bold; margin-bottom: 20px;">Книга вільна і ти можеш прийти за нею.</h2>
        <ul style="list-style: none; padding: 0;" class="d-grid gap-4 my-5">
          <li style="margin-bottom: 15px;">
          <p style="margin: 0; color: #666;">Наша адреса: м. Кропивницький, пер Василевський 10, 5 пов.
           Краще завчасно передзвонити та попередити нас, щоб не попасти в незручну ситуацію.</p>
          <h5 style="margin: 0; font-weight: bold;">тел: 099 196 24 69</h5>
          </li>
        </ul>
        <button type="button" class="btn btn-primary btn-lg" style="width: 100%; margin-top: 20px;" data-dismiss="modal">ОК, дякую!</button>
      </div>
    </div>
  </div>
</div>`;
      console.log("3");
      $("body").append(modal);
      console.log("4");
      var $modal = $("#modalTour");
      $modal.show().addClass("in");
      $("body").addClass("modal-open");

      // Створюємо бекдроп (затемнення фону) вручну
      if ($(".modal-backdrop").length === 0) {
        $("body").append('<div class="modal-backdrop fade in"></div>');
      }

      // Обробник закриття при кліку на кнопку або фон
      $modal.find('[data-dismiss="modal"]').on("click", function () {
        $modal.removeClass("in").hide();
        $(".modal-backdrop").remove();
        $("body").removeClass("modal-open");
        $modal.remove(); // Видаляємо з DOM після закриття
      });

      console.log("5");
      console.log("5");
      // alert(
      //   "Книга свободна и ты можешь прийти за ней." +
      //     " Наш адрес: г. Кропивницкий, переулок Васильевский 10, 5 этаж." +
      //     " Лучше предварительно прозвонить и предупредить нас, чтоб " +
      //     " не попасть в неловкую ситуацию. Тел. 099 196 24 69" +
      //     " \n\n",
      // );
    } catch (error) {
      console.error("Деталі помилки:", error);
      alert(
        `Виникла помилка на сервері, спробуйте будь-ласка пізніше. \n статус: ${error}`,
      );
    }
  }
});
