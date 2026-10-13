const products = [
{
id:1,
name:"Smart Watch",
price:4999,
image:"https://images.unsplash.com/photo-1523275335684-37898b6baf30"
},
{
id:2,
name:"Headphones",
price:1999,
image:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e"
},
{
id:3,
name:"Shoes",
price:2999,
image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff"
},
{
id:4,
name:"Camera",
price:8999,
image:"https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f"
}
];

const grid = document.getElementById("productGrid");

products.forEach(product => {

grid.innerHTML += `
<div class="card">

<img src="${product.image}" alt="">

<h3>${product.name}</h3>

<p>₹${product.price}</p>

<button onclick="addToCart(${product.id})">
Add To Cart
</button>

</div>
`;

});

function addToCart(id){

let cart =
JSON.parse(localStorage.getItem("cart")) || [];

cart.push(id);

localStorage.setItem(
"cart",
JSON.stringify(cart)
);

alert("Added To Cart");

}

const darkBtn =
document.getElementById("darkModeBtn");

darkBtn.addEventListener("click",()=>{

document.body.classList.toggle("dark");

});
